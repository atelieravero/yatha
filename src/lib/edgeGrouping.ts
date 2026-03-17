import { SYSTEM_PREDICATES } from "@/db/schema";

/**
 * Calculates the dynamic temporal boundaries of an edge based on its nodes' lifespans.
 */
export function getEffectiveEdgeBounds(edge: any, activeNode: any, connectedNode: any) {
  // 1. Explicit TIMELESS override (Binds to Connected Node's timeline)
  if (edge.temporalInput === 'TIMELESS') {
    return {
      start: connectedNode.notEarlierThan ? new Date(connectedNode.notEarlierThan) : null,
      end: connectedNode.notLaterThan ? new Date(connectedNode.notLaterThan) : null,
      inferred: true
    };
  }

  // 2. Explicit User Bounds on Edge
  if (edge.notEarlierThan || edge.notLaterThan) {
    return {
      start: edge.notEarlierThan ? new Date(edge.notEarlierThan) : null,
      end: edge.notLaterThan ? new Date(edge.notLaterThan) : null,
      inferred: false
    };
  }

  // 3. Inference / Intersection (The "One Simple Rule")
  const aStart = activeNode.notEarlierThan ? new Date(activeNode.notEarlierThan).getTime() : null;
  const aEnd = activeNode.notLaterThan ? new Date(activeNode.notLaterThan).getTime() : null;

  const bStart = connectedNode.notEarlierThan ? new Date(connectedNode.notEarlierThan).getTime() : null;
  const bEnd = connectedNode.notLaterThan ? new Date(connectedNode.notLaterThan).getTime() : null;

  const maxStart = aStart && bStart ? Math.max(aStart, bStart) : (aStart || bStart);
  const minEnd = aEnd && bEnd ? Math.min(aEnd, bEnd) : (aEnd || bEnd);

  // Validity Check: If Start is strictly after End, they do not overlap. Destroy the intersection.
  if (maxStart && minEnd && maxStart > minEnd) {
    return { start: null, end: null, inferred: false };
  }

  return {
    start: maxStart ? new Date(maxStart) : null,
    end: minEnd ? new Date(minEnd) : null,
    inferred: !!(maxStart || minEnd) // True if we successfully inferred a bound
  };
}

/**
 * Multi-tier sorting engine for Edge Rows.
 */
export function sortEdgeGroup(items: any[], sortMode: 'ASC' | 'DESC' | 'RECENT', allPredicates: any[] = []) {
  return [...items].sort((a, b) => {
     // 1. User Pinned Weights (Manual override always wins)
     const weightA = a.isSource ? a.edge.sourceSortOrder : a.edge.targetSortOrder;
     const weightB = b.isSource ? b.edge.sourceSortOrder : b.edge.targetSortOrder;
     if (weightA !== weightB) return (weightA ?? 999) - (weightB ?? 999);

     // 2. Fallback to Update Time (RECENT)
     if (sortMode === 'RECENT') {
       const timeA = new Date(a.edge.assertedAt || 0).getTime();
       const timeB = new Date(b.edge.assertedAt || 0).getTime();
       return timeB - timeA; // Newest first
     }

     // 3. Chronological Sort (ASC / DESC)
     const startA = a.effectiveStart ? a.effectiveStart.getTime() : null;
     const startB = b.effectiveStart ? b.effectiveStart.getTime() : null;

     const endA = a.effectiveEnd ? a.effectiveEnd.getTime() : null;
     const endB = b.effectiveEnd ? b.effectiveEnd.getTime() : null;

     if (sortMode === 'ASC') {
        if (startA !== startB) {
          if (startA === null) return 1; // Open starts pushed to bottom
          if (startB === null) return -1;
          return startA - startB; // Oldest starts first
        }
        if (endA !== endB) {
          if (endA === null) return 1;
          if (endB === null) return -1;
          return endA - endB;
        }
     } else if (sortMode === 'DESC') {
        if (endA !== endB) {
          if (endA === null) return 1; // Open ends pushed to bottom
          if (endB === null) return -1;
          return endB - endA; // Newest ends first
        }
        if (startA !== startB) {
          if (startA === null) return 1;
          if (startB === null) return -1;
          return startB - startA;
        }
     }

     // 4. Alphabetical Fallback (If no dates exist or dates are identical)
     const predA = allPredicates.find(p => p.id === a.edge.predicateId);
     const predB = allPredicates.find(p => p.id === b.edge.predicateId);
     
     const labelA = a.isSource ? predA?.forwardLabel : predA?.reverseLabel;
     const labelB = b.isSource ? predB?.forwardLabel : predB?.reverseLabel;

     const predCompare = (labelA || '').localeCompare(labelB || '');
     if (predCompare !== 0) return predCompare;

     return (a.node.label || '').localeCompare(b.node.label || '');
  });
}

export function groupEdges(connectedEdges: any[], activeNode: any, allNodes: any[]) {
  const groups = {
    physicalHoldings: [] as any[],
    digitalArtifacts: [] as any[],
    mediaAppearances: [] as any[],
    conceptualSemantics: [] as any[],
    bridgedConcepts: [] as any[],
    physicalSources: [] as any[],
    containedIn: [] as any[],
    containsItems: [] as any[]
  };

  connectedEdges.forEach(edge => {
    const isSource = edge.sourceId === activeNode.id;
    const node = allNodes.find(n => n.id === (isSource ? edge.targetId : edge.sourceId));
    if (!node) return;

    const nodeIsIdentity = node.layer === 'IDENTITY';
    const nodeIsPhysical = node.layer === 'PHYSICAL';
    const nodeIsMedia = node.layer === 'MEDIA';

    // Calculate effective bounds and attach them to the item for the UI to consume
    const bounds = getEffectiveEdgeBounds(edge, activeNode, node);

    const item = { 
      edge, 
      node, 
      isSource,
      effectiveStart: bounds.start,
      effectiveEnd: bounds.end,
      inferredBounds: bounds.inferred
    };

    if (edge.predicateId === SYSTEM_PREDICATES.CARRIES) {
      if (!isSource) {
        if (nodeIsPhysical) groups.physicalHoldings.push(item);
        else if (nodeIsMedia) groups.digitalArtifacts.push(item);
      } else {
        if (nodeIsIdentity) groups.bridgedConcepts.push(item);
        else if (nodeIsPhysical) groups.physicalSources.push(item);
      }
    } 
    else if (edge.predicateId === SYSTEM_PREDICATES.CONTAINS) {
      if (isSource) groups.containsItems.push(item);
      else groups.containedIn.push(item);
    } 
    else {
      if (activeNode.layer === 'MEDIA') groups.conceptualSemantics.push(item);
      else {
        if (nodeIsMedia) groups.mediaAppearances.push(item);
        else groups.conceptualSemantics.push(item);
      }
    }
  });

  return groups;
}