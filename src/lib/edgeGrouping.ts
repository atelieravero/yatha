import { SYSTEM_PREDICATES } from "@/db/schema";

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

    const item = { edge, node, isSource };

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