"use server";

import { db } from "@/db";
import { nodes, edges, nodeHistory, kinds, predicates, SYSTEM_PREDICATES } from "@/db/schema";
import { eq, desc, ilike, or, sql, and, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { generateUploadUrl, generateReadUrl } from "@/lib/s3";

// ============================================================================
// NODE RETRIEVAL
// ============================================================================

export async function getRecentNodes() {
  return await db
    .select()
    .from(nodes)
    .where(eq(nodes.isActive, true))
    .orderBy(desc(nodes.updatedAt))
    .limit(50);
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
// EVENT LEDGER (Audit Trail Helper)
// ============================================================================

/**
 * Captures the current state of a node and saves it to the history ledger 
 * before any destructive updates occur.
 */
async function captureNodeSnapshot(nodeId: string, userId: string = "system_user") {
  const [currentNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  
  if (!currentNode) {
    throw new Error("Node not found");
  }

  // Insert the historical snapshot
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
  const [snapshot] = await db.select().from(nodeHistory).where(eq(nodeHistory.snapshotId, snapshotId));
  if (!snapshot) throw new Error("Snapshot not found");

  // Capture current state before overwriting so we don't lose the present!
  await captureNodeSnapshot(nodeId, "system_user_restored");

  // Re-parse the fuzzy temporal bounds for the native columns
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
      updatedAt: new Date(),
      updatedBy: "system_user_restored"
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
  if (oldKindId === newKindId) throw new Error("Cannot migrate a kind to itself.");

  // 1. Fetch all nodes using the old kind
  const affectedNodes = await db.select().from(nodes).where(eq(nodes.kind, oldKindId));

  // 2. Capture a historical snapshot for each node before mutating
  for (const node of affectedNodes) {
    await captureNodeSnapshot(node.id, "system_admin_migration");
  }

  // 3. Bulk migrate the nodes to the new kind
  if (affectedNodes.length > 0) {
    await db.update(nodes)
      .set({ 
        kind: newKindId, 
        updatedAt: new Date(),
        updatedBy: "system_admin_migration"
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
    { id: SYSTEM_PREDICATES.DERIVED_FROM, forwardLabel: 'DERIVED FROM', reverseLabel: 'source of', isSymmetric: false, isSystem: true, isActive: true },
    { id: SYSTEM_PREDICATES.CONTAINS, forwardLabel: 'CONTAINS', reverseLabel: 'part of', isSymmetric: false, isSystem: true, isActive: true },
    // NEW: System predicate for media tags/identified subjects
    { id: SYSTEM_PREDICATES.REFERENCES, forwardLabel: 'REFERENCES', reverseLabel: 'referenced in', isSymmetric: false, isSystem: true, isActive: true }, 
  ];
  for (const pred of systemPreds) {
    // Upsert prevents crashing if they already exist in the DB
    await db.insert(predicates).values(pred).onConflictDoNothing();
  }
}

export async function createPredicate(forwardLabel: string, reverseLabel: string, isSymmetric: boolean) {
  await db.insert(predicates).values({
    forwardLabel,
    reverseLabel: isSymmetric ? forwardLabel : reverseLabel,
    isSymmetric,
    isSystem: false,
    isActive: true,
  });
  revalidatePath('/');
}

export async function updatePredicate(id: string, forwardLabel: string, reverseLabel: string, isSymmetric: boolean) {
  await db.update(predicates)
    .set({ 
      forwardLabel, 
      reverseLabel: isSymmetric ? forwardLabel : reverseLabel,
      isSymmetric 
    })
    .where(eq(predicates.id, id));
  revalidatePath('/');
}

export async function deactivateAndMigratePredicate(oldId: string, newId: string) {
  if (oldId === newId) throw new Error("Cannot migrate a predicate to itself.");
  
  const [oldPred] = await db.select().from(predicates).where(eq(predicates.id, oldId));
  if (oldPred?.isSystem) throw new Error("Cannot deactivate a system core predicate.");

  const affectedEdges = await db.select().from(edges).where(eq(edges.predicateId, oldId));
  if (affectedEdges.length > 0) {
    await db.update(edges)
      .set({ predicateId: newId, assertedAt: new Date(), assertedBy: "system_admin_migration" })
      .where(eq(edges.predicateId, oldId));
  }

  await db.update(predicates).set({ isActive: false }).where(eq(predicates.id, oldId));
  revalidatePath('/');
}

// ============================================================================
// NODE CREATION & UPDATES (Sidebar & Editor)
// ============================================================================

export async function createNode(label: string, layer: "IDENTITY" | "INSTANCE", kind: string) {
  const [newNode] = await db.insert(nodes).values({
    layer,
    kind: kind,
    label,
    updatedBy: "system_user", 
  }).returning({ id: nodes.id });

  revalidatePath('/');
  return newNode.id;
}

export async function updateNodeLabel(nodeId: string, label: string) {
  // 1. Capture snapshot for the ledger
  await captureNodeSnapshot(nodeId);

  // 2. Apply the update
  await db.update(nodes)
    .set({ 
      label, 
      updatedAt: new Date() 
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeKind(nodeId: string, kind: string) {
  // 1. Capture snapshot for the ledger
  await captureNodeSnapshot(nodeId);

  // 2. Apply the update
  await db.update(nodes)
    .set({ 
      kind: kind,
      updatedAt: new Date() 
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeAliases(nodeId: string, aliases: string[]) {
  // 1. Capture snapshot for the ledger
  await captureNodeSnapshot(nodeId);

  // 2. Apply the update
  await db.update(nodes)
    .set({ 
      aliases, 
      updatedAt: new Date() 
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
}

export async function updateNodeProperties(nodeId: string, newProps: any) {
  // 1. Capture snapshot for the ledger AND get the current state
  const currentNode = await captureNodeSnapshot(nodeId);
  const existingProps = (currentNode.properties as Record<string, any>) || {};
  
  // 2. Preserve strictly managed system properties
  const updatedProps = { ...newProps };
  if (existingProps.fileUrl) updatedProps.fileUrl = existingProps.fileUrl;
  if (existingProps.mimeType) updatedProps.mimeType = existingProps.mimeType;
  if (existingProps.fileSize) updatedProps.fileSize = existingProps.fileSize;
  if (existingProps.hash) updatedProps.hash = existingProps.hash;

  // --- NEW: TEMPORAL PARSER INTERCEPTION ---
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
      updatedAt: new Date() 
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/');
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
  // Capture snapshot before attaching media properties
  const currentNode = await captureNodeSnapshot(nodeId);
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
      updatedAt: new Date()
    })
    .where(eq(nodes.id, nodeId));
  
  revalidatePath('/'); 
}

// 3. Ask Cloudflare for a secure read ticket (GET) for private viewing
export async function getSecureMediaUrl(filename: string) {
  return await generateReadUrl(filename);
}

// ============================================================================
// TEMPORAL PARSING UTILITY
// ============================================================================

function parseFuzzyTemporal(fuzzyDateStr?: string | null): { notEarlierThan?: Date, notLaterThan?: Date } {
  if (!fuzzyDateStr) return {};
  
  try {
    const str = fuzzyDateStr.toLowerCase().trim();
    let parts: string[];
    
    // Support range inputs, including open-ended "1988-"
    if (str.includes('~')) {
      parts = str.split('~').map(s => s.trim());
    } else if (str.match(/^-?\d{1,4}-$/)) {
      parts = [str.slice(0, -1), ""]; // Split into ["1988", ""]
    } else {
      parts = [str];
    }

    // Helper: Safely generate exact UTC dates while bypassing JS's annoying 1900-1999 assumption
    const createUTC = (y: number, m: number, d: number, isEnd: boolean) => {
      const date = new Date(Date.UTC(y, m, d, isEnd ? 23 : 0, isEnd ? 59 : 0, isEnd ? 59 : 0, isEnd ? 999 : 0));
      if (y >= 0 && y < 100) date.setUTCFullYear(y); // Force the year to stay 0-99
      return date;
    };
    
    const parsePart = (p: string, isStart: boolean): Date | null | undefined => {
      if (!p || p === '?') return null; // Interpreted as open/unknown boundary

      // 1. Century (e.g., "17th century", "1st century")
      const centuryMatch = p.match(/^(\d+)(st|nd|rd|th)?\s*century$/);
      if (centuryMatch) {
        const century = parseInt(centuryMatch[1]);
        const startYear = (century - 1) * 100 + 1; // e.g. 17th -> 1601
        const endYear = century * 100;             // e.g. 17th -> 1700
        return isStart ? createUTC(startYear, 0, 1, false) : createUTC(endYear, 11, 31, true);
      }

      // 2. Decade (e.g., "1980s")
      const decadeMatch = p.match(/^(\d{3,4})s$/);
      if (decadeMatch) {
        const decade = parseInt(decadeMatch[1]);
        return isStart ? createUTC(decade, 0, 1, false) : createUTC(decade + 9, 11, 31, true);
      }

      // 3. Strict ISO-ish formats (YYYY, YYYY-MM, YYYY-MM-DD)
      const dateMatch = p.match(/^(-?(?:0|[1-9]\d{0,3}))(?:-(0?[1-9]|1[0-2]))?(?:-(0?[1-9]|[12]\d|3[01]))?$/);
      if (dateMatch) {
        const year = parseInt(dateMatch[1]);
        const month = dateMatch[2] ? parseInt(dateMatch[2]) - 1 : undefined;
        const day = dateMatch[3] ? parseInt(dateMatch[3]) : undefined;
        
        // App-crash defense
        if (year > 10000 || year < -10000) return undefined;
        
        if (month === undefined) {
          return isStart ? createUTC(year, 0, 1, false) : createUTC(year, 11, 31, true);
        } else if (day === undefined) {
          if (month < 0 || month > 11) return undefined;
          
          let tmp = new Date(Date.UTC(year, month + 1, 0));
          if (year >= 0 && year < 100) tmp.setUTCFullYear(year);
          const lastDay = tmp.getUTCDate();
          
          return isStart ? createUTC(year, month, 1, false) : createUTC(year, month, lastDay, true);
        } else {
          if (month < 0 || month > 11 || day < 1 || day > 31) return undefined;
          return isStart ? createUTC(year, month, day, false) : createUTC(year, month, day, true);
        }
      }

      return undefined;
    };

    let notEarlierThan: Date | undefined = undefined;
    let notLaterThan: Date | undefined = undefined;

    if (parts.length === 1) {
       const start = parsePart(parts[0], true);
       const end = parsePart(parts[0], false);
       
       if (start === undefined || end === undefined) return {};
       
       notEarlierThan = start === null ? undefined : start;
       notLaterThan = end === null ? undefined : end;
    } else if (parts.length === 2) {
       const start = parsePart(parts[0], true);
       const end = parsePart(parts[1], false);
       
       if (start === undefined || end === undefined) return {};
       
       notEarlierThan = start === null ? undefined : start;
       notLaterThan = end === null ? undefined : end;
    }

    if (notEarlierThan && notLaterThan && notEarlierThan.getTime() > notLaterThan.getTime()) {
      return {}; 
    }

    return { notEarlierThan, notLaterThan };
  } catch (e) {
    console.error("Temporal parsing failed", e);
  }
  return {};
}

// ============================================================================
// GRAPH RELATIONSHIPS (EDGES)
// ============================================================================

export async function assertEdge(
  sourceId: string,
  targetId: string,
  predicateId: string, 
  category: "SEMANTIC" | "STRUCTURAL" | "LINEAGE",
  temporalInput?: string | null,
  role?: string | null,
  sortOrder?: number | null,
  properties?: Record<string, any> // NEW: Supports arbitrary edge metadata like locators!
) {
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
    temporalInput: temporalInput || null,
    notEarlierThan: bounds.notEarlierThan || null,
    notLaterThan: bounds.notLaterThan || null,
    role: role || null,
    properties: properties || {},
    sourceSortOrder: sortOrder || 999,
    targetSortOrder: sortOrder || 999,
    assertedBy: 'system', // Placeholder until Auth is added
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
  newProperties?: Record<string, any> // NEW: Allow updating JSONB properties safely
) {
  // 1. Fetch the existing edge so we can duplicate its core structure
  const [existingEdge] = await db.select().from(edges).where(eq(edges.id, edgeId));
  
  if (!existingEdge) {
    throw new Error("Edge not found.");
  }

  const bounds = parseFuzzyTemporal(newTemporalInput);
  
  // Merge properties so we don't accidentally wipe data
  const updatedProps = newProperties ? { ...(existingEdge.properties as Record<string, any>), ...newProperties } : existingEdge.properties;

  // 2. Soft delete the old edge (Retract it)
  await db.update(edges)
    .set({ isActive: false, retractedAt: new Date() })
    .where(eq(edges.id, edgeId));

  // 3. Assert the new edge with the updated properties
  await db.insert(edges).values({
    sourceId: existingEdge.sourceId,
    targetId: existingEdge.targetId,
    predicateId: existingEdge.predicateId,
    category: existingEdge.category as "SEMANTIC" | "STRUCTURAL" | "LINEAGE",
    
    // The updated properties:
    temporalInput: newTemporalInput || null,
    notEarlierThan: bounds.notEarlierThan || null,
    notLaterThan: bounds.notLaterThan || null,
    role: existingEdge.role, 
    properties: updatedProps,
    
    // Maintain the old sort order
    sourceSortOrder: existingEdge.sourceSortOrder,
    targetSortOrder: existingEdge.targetSortOrder,
    
    assertedBy: 'system_user_edit', // Represents an edited assertion
    isActive: true,
    retractedAt: null, 
  });

  revalidatePath('/');
}

// ============================================================================
// PEEK DRAWER CONTEXT GETTER
// ============================================================================

export async function getQuickContext(nodeId: string) {
  // 1. Fetch active edges connected to this node
  const connectedEdges = await db
    .select()
    .from(edges)
    .where(
      and(
        eq(edges.isActive, true),
        or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId))
      )
    );

  if (connectedEdges.length === 0) return [];

  // 2. Fetch the predicates to resolve the labels
  const allPreds = await db.select().from(predicates);

  // 3. Get unique related node IDs and fetch their labels
  const relatedNodeIds = connectedEdges.map(e => e.sourceId === nodeId ? e.targetId : e.sourceId);
  const uniqueNodeIds = Array.from(new Set(relatedNodeIds));

  const relatedNodes = await db
    .select({ id: nodes.id, label: nodes.label })
    .from(nodes)
    .where(inArray(nodes.id, uniqueNodeIds));

  // 4. Map it all together for the lightweight Peek Drawer view
  return connectedEdges.map(edge => {
    const isSource = edge.sourceId === nodeId;
    const targetNodeId = isSource ? edge.targetId : edge.sourceId;
    
    const targetNode = relatedNodes.find(n => n.id === targetNodeId);
    const pred = allPreds.find(p => p.id === edge.predicateId);
    
    return {
      predicate: pred ? (isSource ? pred.forwardLabel : pred.reverseLabel) : 'UNKNOWN',
      label: targetNode ? targetNode.label : 'Unknown Node',
      isSystem: pred ? pred.isSystem : false
    };
  });
}

// ============================================================================
// UX WORKFLOW ACTIONS (Compound Operations)
// ============================================================================

export async function createPhysicalHolding(
  identityId: string,
  label: string,
  properties: Record<string, any>
) {
  // 1. Mint the Physical Instance
  const [newNode] = await db.insert(nodes).values({
    layer: 'INSTANCE',
    kind: 'PHYSICAL_OBJECT',
    label,
    properties,
    updatedBy: "system_user", 
  }).returning({ id: nodes.id });

  // 2. Assert the CARRIES edge (Bridging Layer 2 to Layer 1)
  await db.insert(edges).values({
    sourceId: newNode.id,
    targetId: identityId,
    predicateId: SYSTEM_PREDICATES.CARRIES,
    category: "STRUCTURAL",
    assertedBy: 'system_user',
    isActive: true,
  });

  revalidatePath('/');
  return newNode.id;
}

export async function createDigitalArtifact(
  identityId: string,
  label: string,
  kind: string,
  fileData: { fileUrl: string, mimeType: string, fileSize: number, hash: string },
  role?: string,
  derivedFromId?: string
) {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 1. Mint the Digital Instance
  const [newNode] = await db.insert(nodes).values({
    layer: 'INSTANCE',
    kind,
    label,
    properties: {
      fileUrl: fileData.fileUrl,
      mimeType: fileData.mimeType,
      fileSize: formatBytes(fileData.fileSize),
      hash: fileData.hash
    },
    updatedBy: "system_user", 
  }).returning({ id: nodes.id });

  // 2. Assert the CARRIES edge to the Identity
  await db.insert(edges).values({
    sourceId: newNode.id,
    targetId: identityId,
    predicateId: SYSTEM_PREDICATES.CARRIES,
    category: "STRUCTURAL",
    role: role || null,
    assertedBy: 'system_user',
    isActive: true,
  });

  // 3. Optional: Assert DERIVED_FROM edge for Lineage
  if (derivedFromId) {
    await db.insert(edges).values({
      sourceId: newNode.id,
      targetId: derivedFromId,
      predicateId: SYSTEM_PREDICATES.DERIVED_FROM,
      category: "LINEAGE",
      assertedBy: 'system_user',
      isActive: true,
    });
  }

  revalidatePath('/');
  return newNode.id;
}

export async function checkDuplicateArtifact(hash: string) {
  // Queries the JSONB column for an exact hash match
  const [existing] = await db
    .select({ id: nodes.id, label: nodes.label, kind: nodes.kind })
    .from(nodes)
    .where(sql`${nodes.properties}->>'hash' = ${hash}`);
  
  return existing || null;
}

export async function linkExistingArtifact(identityId: string, instanceId: string, role?: string) {
  // Reuses an existing Layer 2 Instance by asserting a new CARRIES edge to this Layer 1 Identity
  await db.insert(edges).values({
    sourceId: instanceId,
    targetId: identityId,
    predicateId: SYSTEM_PREDICATES.CARRIES,
    category: "STRUCTURAL",
    role: role || null,
    assertedBy: 'system_user',
    isActive: true,
  });
  revalidatePath('/');
}

export async function createAndLinkIdentity(label: string, kind: string, sourceId: string, predicateId: string, isReverse: boolean) {
  // 1. Mint the new Identity
  const [newNode] = await db.insert(nodes).values({
    layer: 'IDENTITY',
    kind: kind,
    label,
    updatedBy: "system_user", 
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
    assertedBy: 'system_user',
    isActive: true,
  });

  revalidatePath('/');
}