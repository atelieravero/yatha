"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { users, nodes, edges, nodeHistory, kinds, predicates, SYSTEM_PREDICATES } from "@/db/schema";
import { eq, desc, ilike, or, sql, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateUploadUrl, generateReadUrl } from "@/lib/s3";
import { parseFuzzyTemporal } from "@/lib/dateParser";

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

async function requireUserId() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error("Unauthorized: No active session. Please log in.");
  }
  return userId as string;
}

// Strict helper for Admin Panel actions
async function requireSuperuser() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id || user?.role !== 'SUPERUSER') {
    throw new Error("Unauthorized: Superuser access required.");
  }
  return user.id as string;
}

// ============================================================================
// URL METADATA AUTO-FETCH
// ============================================================================

export async function fetchUrlMetadata(url: string) {
  try {
    const response = await fetch(url, {
      headers: { 
        // A generic User-Agent prevents aggressive bot-blockers from immediately rejecting the request
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      },
      signal: AbortSignal.timeout(5000) // 5-second timeout so the UI doesn't hang forever
    });
    
    if (!response.ok) return { title: null, description: null };
    const html = await response.text();

    let title = null;
    let description = null;

    // 1. Extract Title (Prefer Open Graph, fallback to <title>)
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["'][^>]*>/i);
    if (ogTitleMatch) title = ogTitleMatch[1];

    if (!title) {
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) title = titleMatch[1];
    }

    // 2. Extract Description (Prefer Open Graph, fallback to standard meta)
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["'][^>]*>/i) ||
                        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (ogDescMatch) description = ogDescMatch[1];

    // Simple HTML entity decoder
    const decode = (str: string) => str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

    return {
      title: title ? decode(title) : null,
      description: description ? decode(description) : null
    };
  } catch (e) {
    // Graceful Degradation: If anything goes wrong (CORS, timeouts, blocked fetch), we just return nulls.
    // The UI will fall back to using the raw URL!
    return { title: null, description: null };
  }
}

// ============================================================================
// USER MANAGEMENT (Admin Panel)
// ============================================================================

export async function getAllUsers() {
  await requireSuperuser();
  return await db.select().from(users).orderBy(desc(users.createdAt));
}

export async function inviteUser(email: string, role: string) {
  await requireSuperuser();
  
  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail || !normalizedEmail.includes('@')) throw new Error("Invalid email address.");

  const existing = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (existing.length > 0) throw new Error("User already exists.");

  await db.insert(users).values({ email: normalizedEmail, role: role, isActive: true });
  revalidatePath('/admin');
}

export async function updateUserRole(userId: string, newRole: string) {
  await requireSuperuser();
  await db.update(users).set({ role: newRole }).where(eq(users.id, userId));
  revalidatePath('/admin');
}

export async function toggleUserAccess(userId: string, isActive: boolean) {
  await requireSuperuser();
  await db.update(users).set({ isActive }).where(eq(users.id, userId));
  revalidatePath('/admin');
}

// ============================================================================
// NODE RETRIEVAL
// ============================================================================

export async function getRecentNodes() {
  return await db.select().from(nodes).where(eq(nodes.isActive, true)).orderBy(desc(nodes.updatedAt)).limit(50);
}

export async function searchGraphNodes(query: string) {
  return await db
    .select()
    .from(nodes)
    .where(
      or(
        // 1. Search the primary label
        ilike(nodes.label, `%${query}%`),
        // 2. Search the aliases array (converts the text[] to a string for fuzzy matching)
        sql`array_to_string(${nodes.aliases}, ', ') ILIKE ${`%${query}%`}`
      )
    )
    .limit(20);
}

// ============================================================================
// PEEK DRAWER CONTEXT GETTER
// ============================================================================

export async function getQuickContext(nodeId: string) {
  const connectedEdges = await db.select().from(edges).where(and(eq(edges.isActive, true), or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId))));
  if (connectedEdges.length === 0) return { edges: [], relatedNodes: [] };

  const relatedNodeIds = connectedEdges.map(e => e.sourceId === nodeId ? e.targetId : e.sourceId);
  const uniqueNodeIds = Array.from(new Set(relatedNodeIds));
  
  // Note: We pull `isActive` here so the UI can style "Zombie Links" correctly!
  const relatedNodes = await db.select({ id: nodes.id, label: nodes.label, layer: nodes.layer, kind: nodes.kind, properties: nodes.properties, isActive: nodes.isActive, aliases: nodes.aliases }).from(nodes).where(inArray(nodes.id, uniqueNodeIds));

  return { edges: connectedEdges, relatedNodes };
}

// ============================================================================
// EVENT LEDGER (Audit Trail Helper)
// ============================================================================

/**
 * Captures the current state of a node and saves it to the history ledger 
 * before any destructive updates occur.
 */
async function captureNodeSnapshot(nodeId: string, overrideUserId?: string) {
  const userId = overrideUserId || await requireUserId();
  const [currentNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  
  if (!currentNode) {
    throw new Error("Node not found");
  }

  // Insert the historical snapshot
  await db.insert(nodeHistory).values({
    nodeId: currentNode.id,
    previousKind: currentNode.kind || "",
    previousLabel: currentNode.label,
    previousAliases: currentNode.aliases || [],
    previousTemporalInput: currentNode.temporalInput,
    previousProperties: currentNode.properties || {},
    replacedBy: userId,
  });

  return currentNode;
}

export async function getNodeHistory(nodeId: string) {
  // Joins users to get avatar/name for the UI
  return await db
    .select({
      snapshotId: nodeHistory.snapshotId,
      replacedAt: nodeHistory.replacedAt,
      previousLabel: nodeHistory.previousLabel,
      previousKind: nodeHistory.previousKind,
      previousAliases: nodeHistory.previousAliases,
      previousTemporalInput: nodeHistory.previousTemporalInput,
      previousProperties: nodeHistory.previousProperties,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatar
    })
    .from(nodeHistory)
    .leftJoin(users, eq(nodeHistory.replacedBy, users.id))
    .where(eq(nodeHistory.nodeId, nodeId))
    .orderBy(desc(nodeHistory.replacedAt));
}

export async function restoreNodeSnapshot(nodeId: string, snapshotId: string) {
  const userId = await requireUserId();
  const [snapshot] = await db.select().from(nodeHistory).where(eq(nodeHistory.snapshotId, snapshotId));
  if (!snapshot) throw new Error("Snapshot not found");

  // Capture current state before overwriting so we don't lose the present!
  await captureNodeSnapshot(nodeId, userId);

  // Re-parse the fuzzy temporal bounds for the native columns
  const bounds = parseFuzzyTemporal(snapshot.previousTemporalInput);

  await db.update(nodes)
    .set({
      kind: snapshot.previousKind || null,
      label: snapshot.previousLabel,
      aliases: snapshot.previousAliases,
      temporalInput: snapshot.previousTemporalInput,
      notEarlierThan: bounds.notEarlierThan || null,
      notLaterThan: bounds.notLaterThan || null,
      properties: snapshot.previousProperties,
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));

  revalidatePath('/');
}

// ============================================================================
// TAXONOMY MANAGEMENT (KINDS)
// ============================================================================

export async function getAllKinds() {
  return await db.select().from(kinds).orderBy(kinds.label);
}

export async function createKind(label: string, icon: string) {
  await db.insert(kinds).values({
    label,
    icon: icon || '🟣',
    isActive: true,
  });

  revalidatePath('/');
}

export async function updateKind(id: string, label: string, icon: string) {
  await db.update(kinds)
    .set({ 
      label, 
      icon: icon || '🟣' 
    })
    .where(eq(kinds.id, id));
  
  revalidatePath('/');
}

export async function deactivateAndMigrateKind(oldKindId: string, newKindId: string) {
  const userId = await requireUserId();
  if (oldKindId === newKindId) throw new Error("Cannot migrate a kind to itself.");

  // 1. Fetch all nodes using the old kind
  const affectedNodes = await db.select().from(nodes).where(eq(nodes.kind, oldKindId));

  // 2. Capture a historical snapshot for each node before mutating
  for (const node of affectedNodes) {
    await captureNodeSnapshot(node.id, userId);
  }

  // 3. Bulk migrate the nodes to the new kind
  if (affectedNodes.length > 0) {
    await db.update(nodes)
      .set({ 
        kind: newKindId, 
        updatedAt: new Date(),
        updatedBy: userId
      })
      .where(eq(nodes.kind, oldKindId));
  }

  // 4. Soft-delete (deactivate) the old kind
  await db.update(kinds)
    .set({ isActive: false })
    .where(eq(kinds.id, oldKindId));

  revalidatePath('/');
}

// ============================================================================
// TAXONOMY MANAGEMENT (PREDICATES)
// ============================================================================

export async function getAllPredicates() {
  return await db.select().from(predicates).orderBy(predicates.forwardLabel);
}

export async function seedSystemPredicates() {
  const systemPreds = [
    { id: SYSTEM_PREDICATES.CARRIES, forwardLabel: 'CARRIES', reverseLabel: 'instantiated in', isSymmetric: false, isSystem: true, isActive: true },
    { id: SYSTEM_PREDICATES.CONTAINS, forwardLabel: 'CONTAINS', reverseLabel: 'part of', isSymmetric: false, isSystem: true, isActive: true },
  ];
  for (const pred of systemPreds) {
    // Upsert prevents crashing if they already exist in the DB
    await db.insert(predicates).values(pred as any).onConflictDoNothing();
  }
}

export async function createPredicate(
  forwardLabel: string, reverseLabel: string, isSymmetric: boolean,
  sourceLayers?: string[] | null, targetLayers?: string[] | null,
  sourceDefaultKind?: string | null, targetDefaultKind?: string | null
) {
  await db.insert(predicates).values({
    forwardLabel,
    reverseLabel: isSymmetric ? forwardLabel : reverseLabel,
    isSymmetric,
    isSystem: false,
    isActive: true,
    sourceLayers,
    targetLayers,
    sourceDefaultKind,
    targetDefaultKind
  });
  revalidatePath('/');
}

export async function updatePredicate(
  id: string, forwardLabel: string, reverseLabel: string, isSymmetric: boolean,
  sourceLayers?: string[] | null, targetLayers?: string[] | null,
  sourceDefaultKind?: string | null, targetDefaultKind?: string | null
) {
  await db.update(predicates)
    .set({ 
      forwardLabel, 
      reverseLabel: isSymmetric ? forwardLabel : reverseLabel,
      isSymmetric,
      sourceLayers,
      targetLayers,
      sourceDefaultKind,
      targetDefaultKind
    })
    .where(eq(predicates.id, id));
  revalidatePath('/');
}

export async function deactivateAndMigratePredicate(oldId: string, newId: string) {
  const userId = await requireUserId();
  if (oldId === newId) throw new Error("Cannot migrate a predicate to itself.");
  
  const [oldPred] = await db.select().from(predicates).where(eq(predicates.id, oldId));
  if (oldPred?.isSystem) throw new Error("Cannot deactivate a system core predicate.");

  const affectedEdges = await db.select().from(edges).where(eq(edges.predicateId, oldId));
  if (affectedEdges.length > 0) {
    await db.update(edges)
      .set({ predicateId: newId, assertedAt: new Date(), assertedBy: userId })
      .where(eq(edges.predicateId, oldId));
  }

  await db.update(predicates).set({ isActive: false }).where(eq(predicates.id, oldId));
  revalidatePath('/');
}


// ============================================================================
// NODE CREATION & UPDATES (Sidebar & Editor)
// ============================================================================

export async function createNode(label: string, layer: "IDENTITY" | "PHYSICAL" | "MEDIA", kind: string | null) {
  const userId = await requireUserId();
  const [newNode] = await db.insert(nodes).values({
    layer,
    kind: kind,
    label,
    updatedBy: userId, 
  }).returning({ id: nodes.id });

  revalidatePath('/');
  return newNode.id;
}

export async function updateNodeLabel(nodeId: string, label: string) {
  const userId = await requireUserId();
  // 1. Capture snapshot for the ledger
  await captureNodeSnapshot(nodeId, userId);

  // 2. Apply the update
  await db.update(nodes)
    .set({ 
      label, 
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeKind(nodeId: string, kind: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId);

  await db.update(nodes)
    .set({ 
      kind: kind,
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeAliases(nodeId: string, aliases: string[]) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId);

  await db.update(nodes)
    .set({ 
      aliases, 
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeProperties(nodeId: string, newProps: any) {
  const userId = await requireUserId();
  
  // 1. Capture snapshot for the ledger AND get the current state
  const currentNode = await captureNodeSnapshot(nodeId, userId);
  const existingProps = (currentNode.properties as Record<string, any>) || {};
  
  // 2. Preserve strictly managed system properties
  const updatedProps = { ...newProps };
  if (existingProps.fileUrl) updatedProps.fileUrl = existingProps.fileUrl;
  if (existingProps.mimeType) updatedProps.mimeType = existingProps.mimeType;
  if (existingProps.fileSize) updatedProps.fileSize = existingProps.fileSize;
  if (existingProps.hash) updatedProps.hash = existingProps.hash;

  // --- TEMPORAL PARSER INTERCEPTION ---
  let temporalInput = currentNode.temporalInput;
  let notEarlierThan = currentNode.notEarlierThan;
  let notLaterThan = currentNode.notLaterThan;

  if (updatedProps.temporal_input !== undefined) {
    temporalInput = updatedProps.temporal_input;
    const bounds = parseFuzzyTemporal(temporalInput);
    notEarlierThan = bounds.notEarlierThan || null;
    notLaterThan = bounds.notLaterThan || null;
  }

  // 3. Save back to the JSONB column AND update native temporal columns
  await db.update(nodes)
    .set({ 
      properties: updatedProps,
      temporalInput: temporalInput || null,
      notEarlierThan: notEarlierThan,
      notLaterThan: notLaterThan,
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function deactivateNode(nodeId: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId);
  await db.update(nodes).set({ isActive: false, updatedAt: new Date(), updatedBy: userId }).where(eq(nodes.id, nodeId));
  revalidatePath('/');
}

export async function restoreNode(nodeId: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId);
  await db.update(nodes).set({ isActive: true, updatedAt: new Date(), updatedBy: userId }).where(eq(nodes.id, nodeId));
  revalidatePath('/');
}

export async function getExactMatchNode(label: string, layer: "IDENTITY" | "PHYSICAL") {
  const [existing] = await db
    .select()
    .from(nodes)
    .where(and(eq(nodes.layer, layer), ilike(nodes.label, label)));
  return existing || null;
}

// ============================================================================
// MEDIA HANDLING (Cloudflare R2)
// ============================================================================

// 1. Ask Cloudflare for a secure upload ticket (PUT)
export async function getUploadTicket(filename: string, contentType: string) {
  return await generateUploadUrl(filename, contentType);
}

// 2. Save the resulting Cloudflare URL and file metadata into the Node's JSONB properties
export async function attachFileToNode(nodeId: string, fileUrl: string, mimeType: string, fileSize: number, hash: string) {
  const userId = await requireUserId();
  // Capture snapshot before attaching media properties
  const currentNode = await captureNodeSnapshot(nodeId, userId);
  const existingProps = (currentNode.properties as Record<string, any>) || {};
  
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const updatedProps = { 
    ...existingProps, 
    fileUrl, 
    mimeType,
    fileSize: formatBytes(fileSize),
    hash
  };

  await db.update(nodes)
    .set({ 
      properties: updatedProps,
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/'); 
}

// 3. Ask Cloudflare for a secure read ticket (GET) for private viewing
export async function getSecureMediaUrl(filename: string) {
  return await generateReadUrl(filename);
}

// ============================================================================
// GRAPH RELATIONSHIPS (EDGES)
// ============================================================================

export async function assertEdge(
  sourceId: string,
  targetId: string,
  predicateId: string, 
  category: "SEMANTIC" | "STRUCTURAL" | "CONTAINMENT",
  temporalInput?: string | null,
  sortOrder?: number | null,
  edgeProps?: any
) {
  const userId = await requireUserId();
  if (sourceId === targetId) throw new Error("Nodes cannot be related to themselves.");

  const bounds = parseFuzzyTemporal(temporalInput);

  // Enforce predictable ordering for symmetric relationships in the database
  const [pred] = await db.select().from(predicates).where(eq(predicates.id, predicateId));
  
  let finalSource = sourceId;
  let finalTarget = targetId;

  if (pred?.isSymmetric && sourceId > targetId) {
    finalSource = targetId;
    finalTarget = sourceId;
  }

  await db.insert(edges).values({
    sourceId: finalSource,
    targetId: finalTarget,
    predicateId,
    category,
    properties: edgeProps || {},
    temporalInput: temporalInput || null,
    notEarlierThan: bounds.notEarlierThan || null,
    notLaterThan: bounds.notLaterThan || null,
    sourceSortOrder: sortOrder || 999,
    targetSortOrder: sortOrder || 999,
    assertedBy: userId, 
    isActive: true,
    retractedAt: null, 
  });

  revalidatePath('/');
}

export async function retractEdge(edgeId: string) {
  // Edge retraction is already implemented as a soft-delete (update)
  await db.update(edges)
    .set({ isActive: false, retractedAt: new Date() })
    .where(eq(edges.id, edgeId));

  revalidatePath('/');
}

export async function updateEdgeProperties(
  edgeId: string, 
  newTemporalInput: string | null, 
  newProps: any
) {
  const userId = await requireUserId();
  // 1. Fetch the existing edge so we can duplicate its core structure
  const [existingEdge] = await db.select().from(edges).where(eq(edges.id, edgeId));
  
  if (!existingEdge) {
    throw new Error("Edge not found.");
  }

  const bounds = parseFuzzyTemporal(newTemporalInput);

  // 2. Soft delete the old edge (Retract it)
  await db.update(edges)
    .set({ isActive: false, retractedAt: new Date() })
    .where(eq(edges.id, edgeId));

  // 3. Assert the new edge with the updated properties
  await db.insert(edges).values({
    sourceId: existingEdge.sourceId,
    targetId: existingEdge.targetId,
    predicateId: existingEdge.predicateId,
    category: existingEdge.category as any,
    
    properties: newProps || {},
    temporalInput: newTemporalInput || null,
    notEarlierThan: bounds.notEarlierThan || null,
    notLaterThan: bounds.notLaterThan || null,
    
    // Maintain the old sort order
    sourceSortOrder: existingEdge.sourceSortOrder,
    targetSortOrder: existingEdge.targetSortOrder,
    
    assertedBy: userId, 
    isActive: true,
    retractedAt: null, 
  });

  revalidatePath('/');
}

// ============================================================================
// UX WORKFLOW ACTIONS (Compound Operations)
// ============================================================================

export async function checkDuplicateArtifact(hash: string) {
  // Queries the JSONB column for an exact hash match
  const [existing] = await db
    .select({ id: nodes.id, label: nodes.label, kind: nodes.kind, layer: nodes.layer, isActive: nodes.isActive, aliases: nodes.aliases })
    .from(nodes)
    .where(sql`${nodes.properties}->>'hash' = ${hash}`);
  
  return existing || null;
}

export async function linkExistingArtifact(identityId: string, instanceId: string, role?: string) {
  const userId = await requireUserId();
  // Reuses an existing Layer 2 Instance by asserting a new CARRIES edge to this Layer 1 Identity
  await db.insert(edges).values({
    sourceId: instanceId,
    targetId: identityId,
    predicateId: SYSTEM_PREDICATES.CARRIES,
    category: "STRUCTURAL",
    properties: role ? { role } : {},
    assertedBy: userId,
    isActive: true,
  });
  revalidatePath('/');
}

export async function createAndLinkIdentity(label: string, kind: string, sourceId: string, predicateId: string, isReverse: boolean) {
  const userId = await requireUserId();
  // 1. Mint the new Identity
  const [newNode] = await db.insert(nodes).values({
    layer: 'IDENTITY',
    kind: kind,
    label,
    updatedBy: userId, 
  }).returning({ id: nodes.id });

  // 2. Determine edge direction
  let finalSource = sourceId;
  let finalTarget = newNode.id;
  if (isReverse) {
    finalSource = newNode.id;
    finalTarget = sourceId;
  }

  // 3. Assert the semantic edge
  await db.insert(edges).values({
    sourceId: finalSource,
    targetId: finalTarget,
    predicateId,
    category: "SEMANTIC",
    assertedBy: userId,
    isActive: true,
  });

  revalidatePath('/');
}