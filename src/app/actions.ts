"use server";

import { auth } from "@/auth";
import { db } from "@/db";
import { nodes, edges, nodeHistory, kinds, predicates, SYSTEM_PREDICATES } from "@/db/schema";
import { eq, desc, ilike, or, sql, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateUploadUrl, generateReadUrl } from "@/lib/s3";
import { parseFuzzyTemporal } from "@/lib/dateParser";

// ============================================================================
// AUTHENTICATION HELPER
// ============================================================================

async function requireUserId() {
  const session = await auth();
  const userId = (session?.user as any)?.id;
  if (!userId) {
    throw new Error("Unauthorized: No active session. Please log in.");
  }
  return userId as string;
}

// ============================================================================
// NODE RETRIEVAL
// ============================================================================

export async function getRecentNodes() {
  return await db
    .select()
    .from(nodes)
    .where(eq(nodes.isActive, true)) // STRICTLY ACTIVE ONLY
    .orderBy(desc(nodes.updatedAt))
    .limit(50);
}

export async function searchGraphNodes(query: string) {
  return await db
    .select()
    .from(nodes)
    .where(
      and(
        eq(nodes.isActive, true), // Hide trash from standard search
        or(
          ilike(nodes.label, `%${query}%`),
          sql`array_to_string(${nodes.aliases}, ', ') ILIKE ${`%${query}%`}`
        )
      )
    )
    .limit(20);
}

// ============================================================================
// EVENT LEDGER (Audit Trail Helper)
// ============================================================================

async function captureNodeSnapshot(nodeId: string, userId: string) {
  const [currentNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!currentNode) throw new Error("Node not found");

  await db.insert(nodeHistory).values({
    nodeId: currentNode.id,
    previousKind: currentNode.kind, 
    previousLabel: currentNode.label,
    previousAliases: currentNode.aliases || [],
    previousTemporalInput: currentNode.temporalInput,
    previousProperties: currentNode.properties || {},
    replacedBy: userId,
  });

  return currentNode;
}

export async function getNodeHistory(nodeId: string) {
  return await db
    .select()
    .from(nodeHistory)
    .where(eq(nodeHistory.nodeId, nodeId))
    .orderBy(desc(nodeHistory.replacedAt));
}

export async function restoreNodeSnapshot(nodeId: string, snapshotId: string) {
  const userId = await requireUserId();
  const [snapshot] = await db.select().from(nodeHistory).where(eq(nodeHistory.snapshotId, snapshotId));
  if (!snapshot) throw new Error("Snapshot not found");

  await captureNodeSnapshot(nodeId, userId);
  const bounds = parseFuzzyTemporal(snapshot.previousTemporalInput);

  await db.update(nodes)
    .set({
      kind: snapshot.previousKind,
      label: snapshot.previousLabel,
      aliases: snapshot.previousAliases,
      temporalInput: snapshot.previousTemporalInput,
      notEarlierThan: bounds.notEarlierThan || null,
      notLaterThan: bounds.notLaterThan || null,
      properties: snapshot.previousProperties,
      isActive: true, // ALWAYS RESURRECT IF RESTORING A SNAPSHOT
      updatedAt: new Date(),
      updatedBy: userId
    })
    .where(eq(nodes.id, nodeId));

  revalidatePath('/');
}

// ============================================================================
// SOFT DELETE & RESTORE (Tombstone Management)
// ============================================================================

export async function deactivateNode(nodeId: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId); // Log who deleted it
  
  await db.update(nodes)
    .set({ 
      isActive: false, 
      updatedAt: new Date(), 
      updatedBy: userId 
    })
    .where(eq(nodes.id, nodeId));

  revalidatePath('/');
}

export async function restoreNode(nodeId: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId); // Log who restored it
  
  await db.update(nodes)
    .set({ 
      isActive: true, 
      updatedAt: new Date(), 
      updatedBy: userId 
    })
    .where(eq(nodes.id, nodeId));

  revalidatePath('/');
}

// ============================================================================
// TAXONOMY MANAGEMENT
// ============================================================================

export async function getAllKinds() {
  return await db.select().from(kinds).orderBy(kinds.label);
}

export async function createKind(label: string, icon: string) {
  await requireUserId();
  await db.insert(kinds).values({ 
    label, 
    icon: icon || '🟣', 
    isActive: true 
  });
  revalidatePath('/');
}

export async function updateKind(id: string, label: string, icon: string) {
  await requireUserId();
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

  const affectedNodes = await db.select().from(nodes).where(eq(nodes.kind, oldKindId));
  for (const node of affectedNodes) { 
    await captureNodeSnapshot(node.id, userId); 
  }

  if (affectedNodes.length > 0) {
    await db.update(nodes)
      .set({ 
        kind: newKindId, 
        updatedAt: new Date(), 
        updatedBy: userId 
      })
      .where(eq(nodes.kind, oldKindId));
  }
  
  await db.update(kinds).set({ isActive: false }).where(eq(kinds.id, oldKindId));
  revalidatePath('/');
}

export async function getAllPredicates() {
  return await db.select().from(predicates).orderBy(predicates.forwardLabel);
}

export async function seedSystemPredicates() {
  const systemPreds = [
    { id: SYSTEM_PREDICATES.CARRIES, forwardLabel: 'CARRIES', reverseLabel: 'instantiated in', isSymmetric: false, isSystem: true, isActive: true },
    { id: SYSTEM_PREDICATES.CONTAINS, forwardLabel: 'CONTAINS', reverseLabel: 'part of', isSymmetric: false, isSystem: true, isActive: true },
  ];
  for (const pred of systemPreds) {
    await db.insert(predicates).values(pred).onConflictDoNothing();
  }
}

export async function createPredicate(
  forwardLabel: string, 
  reverseLabel: string, 
  isSymmetric: boolean, 
  sourceLayers: string[] | null = null, 
  targetLayers: string[] | null = null, 
  sourceDefaultKind: string | null = null, 
  targetDefaultKind: string | null = null
) {
  await requireUserId();
  const [newPred] = await db.insert(predicates).values({
    forwardLabel, 
    reverseLabel: isSymmetric ? forwardLabel : reverseLabel, 
    isSymmetric, 
    isSystem: false, 
    isActive: true, 
    sourceLayers, 
    targetLayers, 
    sourceDefaultKind, 
    targetDefaultKind
  }).returning({ id: predicates.id }); 
  
  revalidatePath('/');
  return newPred.id;
}

export async function updatePredicate(
  id: string, 
  forwardLabel: string, 
  reverseLabel: string, 
  isSymmetric: boolean, 
  sourceLayers: string[] | null = null, 
  targetLayers: string[] | null = null, 
  sourceDefaultKind: string | null = null, 
  targetDefaultKind: string | null = null
) {
  await requireUserId();
  await db.update(predicates).set({ 
    forwardLabel, 
    reverseLabel: isSymmetric ? forwardLabel : reverseLabel, 
    isSymmetric, 
    sourceLayers, 
    targetLayers, 
    sourceDefaultKind, 
    targetDefaultKind
  }).where(eq(predicates.id, id));
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
      .set({ 
        predicateId: newId, 
        assertedAt: new Date(), 
        assertedBy: userId 
      })
      .where(eq(edges.predicateId, oldId));
  }

  await db.update(predicates).set({ isActive: false }).where(eq(predicates.id, oldId));
  revalidatePath('/');
}

// ============================================================================
// NODE CREATION & UPDATES (3-Layer Native)
// ============================================================================

export async function createNode(label: string, layer: "IDENTITY" | "PHYSICAL" | "MEDIA", kind?: string | null, properties?: any) {
  const userId = await requireUserId();
  const [newNode] = await db.insert(nodes).values({
    layer, 
    kind: kind || null, 
    label, 
    properties: properties || {}, 
    updatedBy: userId, 
  }).returning({ id: nodes.id });

  revalidatePath('/');
  return newNode.id;
}

export async function updateNodeLabel(nodeId: string, label: string) {
  const userId = await requireUserId();
  await captureNodeSnapshot(nodeId, userId);
  
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
  const currentNode = await captureNodeSnapshot(nodeId, userId);
  const existingProps = (currentNode.properties as Record<string, any>) || {};
  
  const updatedProps = { ...newProps };
  if (existingProps.fileUrl) updatedProps.fileUrl = existingProps.fileUrl;
  if (existingProps.mimeType) updatedProps.mimeType = existingProps.mimeType;
  if (existingProps.fileSize) updatedProps.fileSize = existingProps.fileSize;
  if (existingProps.hash) updatedProps.hash = existingProps.hash;

  let temporalInput = currentNode.temporalInput;
  let notEarlierThan = currentNode.notEarlierThan;
  let notLaterThan = currentNode.notLaterThan;

  if (updatedProps.temporal_input !== undefined) {
    temporalInput = updatedProps.temporal_input;
    const bounds = parseFuzzyTemporal(temporalInput);
    notEarlierThan = bounds.notEarlierThan || null;
    notLaterThan = bounds.notLaterThan || null;
  }

  await db.update(nodes).set({ 
    properties: updatedProps, 
    temporalInput: temporalInput || null, 
    notEarlierThan, 
    notLaterThan, 
    updatedAt: new Date(), 
    updatedBy: userId 
  }).where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

// ============================================================================
// MEDIA HANDLING
// ============================================================================

export async function getUploadTicket(filename: string, contentType: string) {
  await requireUserId();
  return await generateUploadUrl(filename, contentType);
}

export async function attachFileToNode(nodeId: string, fileUrl: string, mimeType: string, fileSize: number, hash: string) {
  const userId = await requireUserId();
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

export async function getSecureMediaUrl(filename: string) {
  await requireUserId();
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
  properties?: Record<string, any>
) {
  const userId = await requireUserId();
  if (sourceId === targetId) throw new Error("Nodes cannot be related to themselves.");

  const bounds = parseFuzzyTemporal(temporalInput);
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
    temporalInput: temporalInput || null, 
    notEarlierThan: bounds.notEarlierThan || null, 
    notLaterThan: bounds.notLaterThan || null, 
    properties: properties || {}, 
    sourceSortOrder: sortOrder || 999, 
    targetSortOrder: sortOrder || 999, 
    assertedBy: userId, 
    isActive: true, 
    retractedAt: null, 
  });
  
  revalidatePath('/');
}

export async function retractEdge(edgeId: string) {
  await requireUserId();
  await db.update(edges)
    .set({ isActive: false, retractedAt: new Date() })
    .where(eq(edges.id, edgeId));
    
  revalidatePath('/');
}

export async function updateEdgeProperties(edgeId: string, newTemporalInput: string | null, newProperties?: Record<string, any>) {
  const userId = await requireUserId();
  const [existingEdge] = await db.select().from(edges).where(eq(edges.id, edgeId));
  if (!existingEdge) throw new Error("Edge not found.");

  const bounds = parseFuzzyTemporal(newTemporalInput);
  const updatedProps = newProperties ? { ...(existingEdge.properties as Record<string, any>), ...newProperties } : existingEdge.properties;

  await db.update(edges).set({ isActive: false, retractedAt: new Date() }).where(eq(edges.id, edgeId));
  
  await db.insert(edges).values({
    sourceId: existingEdge.sourceId, 
    targetId: existingEdge.targetId, 
    predicateId: existingEdge.predicateId, 
    category: existingEdge.category as "SEMANTIC" | "STRUCTURAL" | "CONTAINMENT", 
    temporalInput: newTemporalInput || null, 
    notEarlierThan: bounds.notEarlierThan || null, 
    notLaterThan: bounds.notLaterThan || null, 
    properties: updatedProps, 
    sourceSortOrder: existingEdge.sourceSortOrder, 
    targetSortOrder: existingEdge.targetSortOrder, 
    assertedBy: userId, 
    isActive: true, 
    retractedAt: null, 
  });
  
  revalidatePath('/');
}

// ============================================================================
// PEEK DRAWER CONTEXT GETTER
// ============================================================================

export async function getQuickContext(nodeId: string) {
  const connectedEdges = await db.select().from(edges).where(and(eq(edges.isActive, true), or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId))));
  if (connectedEdges.length === 0) return [];

  const allPreds = await db.select().from(predicates);
  const relatedNodeIds = connectedEdges.map(e => e.sourceId === nodeId ? e.targetId : e.sourceId);
  const uniqueNodeIds = Array.from(new Set(relatedNodeIds));
  
  // Note: We pull `isActive` here so the UI can style "Zombie Links" correctly!
  const relatedNodes = await db.select({ id: nodes.id, label: nodes.label, isActive: nodes.isActive }).from(nodes).where(inArray(nodes.id, uniqueNodeIds));

  return connectedEdges.map(edge => {
    const isSource = edge.sourceId === nodeId;
    const targetNodeId = isSource ? edge.targetId : edge.sourceId;
    const targetNode = relatedNodes.find(n => n.id === targetNodeId);
    const pred = allPreds.find(p => p.id === edge.predicateId);
    return { 
      predicate: pred ? (isSource ? pred.forwardLabel : pred.reverseLabel) : 'UNKNOWN', 
      label: targetNode ? targetNode.label : 'Unknown Node', 
      isSystem: pred ? pred.isSystem : false,
      isTargetActive: targetNode ? targetNode.isActive : true // Pass dead link status to drawer
    };
  });
}

// ============================================================================
// UX WORKFLOW ACTIONS (Compound Operations)
// ============================================================================

export async function checkDuplicateArtifact(hash: string) {
  // We explicitly fetch `isActive` so the dedupe UI can detect Trash files!
  const [existing] = await db
    .select({ 
      id: nodes.id, 
      label: nodes.label, 
      layer: nodes.layer, 
      isActive: nodes.isActive 
    })
    .from(nodes)
    .where(sql`${nodes.properties}->>'hash' = ${hash}`);
    
  return existing || null;
}

// Soft dedupe helper for checking existing Identity/Physical concepts by exact label
export async function getExactMatchNode(label: string, layer: "IDENTITY" | "PHYSICAL") {
  const normalizedLabel = label.toLowerCase().trim();
  
  const [existing] = await db
    .select({ 
      id: nodes.id, 
      label: nodes.label, 
      layer: nodes.layer, 
      isActive: nodes.isActive, 
      aliases: nodes.aliases 
    })
    .from(nodes)
    .where(
      and(
        eq(nodes.layer, layer),
        or(
          ilike(nodes.label, normalizedLabel),
          sql`${normalizedLabel} = ANY(SELECT lower(x) FROM unnest(${nodes.aliases}) AS x)`
        )
      )
    )
    .limit(1);
    
  return existing || null;
}

export async function createDigitalArtifact(
  targetId: string, 
  label: string, 
  kind: string | null, 
  fileData: { fileUrl: string, mimeType: string, fileSize: number, hash: string }
) {
  const userId = await requireUserId();
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const [newNode] = await db.insert(nodes).values({
    layer: 'MEDIA', 
    kind: null, 
    label, 
    properties: { 
      fileUrl: fileData.fileUrl, 
      mimeType: fileData.mimeType, 
      fileSize: formatBytes(fileData.fileSize), 
      hash: fileData.hash 
    }, 
    updatedBy: userId, 
  }).returning({ id: nodes.id });

  await db.insert(edges).values({
    sourceId: newNode.id, 
    targetId: targetId, 
    predicateId: SYSTEM_PREDICATES.CARRIES, 
    category: "STRUCTURAL", 
    assertedBy: userId, 
    isActive: true,
  });

  revalidatePath('/');
  return newNode.id;
}

export async function linkExistingArtifact(targetId: string, instanceId: string) {
  const userId = await requireUserId();
  await db.insert(edges).values({ 
    sourceId: instanceId, 
    targetId: targetId, 
    predicateId: SYSTEM_PREDICATES.CARRIES, 
    category: "STRUCTURAL", 
    assertedBy: userId, 
    isActive: true 
  });
  revalidatePath('/');
}

export async function createAndLinkIdentity(label: string, kind: string, sourceId: string, predicateId: string, isReverse: boolean) {
  const userId = await requireUserId();
  const [newNode] = await db.insert(nodes).values({ 
    layer: 'IDENTITY', 
    kind: kind, 
    label, 
    updatedBy: userId 
  }).returning({ id: nodes.id });

  let finalSource = sourceId;
  let finalTarget = newNode.id;
  if (isReverse) { 
    finalSource = newNode.id; 
    finalTarget = sourceId; 
  }

  await db.insert(edges).values({ 
    sourceId: finalSource, 
    targetId: finalTarget, 
    predicateId, 
    category: "SEMANTIC", 
    assertedBy: userId, 
    isActive: true 
  });
  
  revalidatePath('/');
}