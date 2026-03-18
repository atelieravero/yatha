import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { nodes, edges, SYSTEM_PREDICATES } from "@/db/schema";
import { getSecureMediaUrl, getRecentNodes, getAllKinds, seedSystemPredicates, getAllPredicates } from "@/app/actions";
import { getMediaDetails } from "@/lib/mediaUtils";
import { groupEdges } from "@/lib/edgeGrouping";

import PropertiesEditor from "@/components/PropertiesEditor";
import NodeClassification from "@/components/NodeClassification";
import AliasEditor from "@/components/AliasEditor";
import NodeHistoryViewer from "@/components/NodeHistoryViewer";
import NodeLabelEditor from "@/components/NodeLabelEditor";
import PeekDrawer from "@/components/PeekDrawer";
import NodeTrashToggle from "@/components/NodeTrashToggle";
import NodeLayoutEngine from "@/components/NodeLayoutEngine";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ node?: string | string[]; peek?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNodeId = params?.node;
  const nodeId = Array.isArray(rawNodeId) ? rawNodeId[0] : rawNodeId;

  await seedSystemPredicates();

  if (!nodeId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-zinc-950 text-gray-400 dark:text-zinc-500 p-8 transition-colors">
        <div className="text-center">
          <span className="text-4xl block mb-4">✨</span>
          <p>Select an item from the sidebar to open the workspace.</p>
        </div>
      </div>
    );
  }

  const [rawActiveNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!rawActiveNode) return <div className="p-8 text-red-500 dark:text-red-400">Node not found.</div>;

  const activeNode = {
    ...rawActiveNode,
    layer: rawActiveNode.layer as "IDENTITY" | "PHYSICAL" | "MEDIA",
    properties: (rawActiveNode.properties as Record<string, any>) || {}
  };

  // ============================================================================
  // TOMBSTONE INTERCEPTOR
  // ============================================================================
  if (!activeNode.isActive) {
    return (
      <div className="max-w-4xl mx-auto p-8 md:p-12 pb-32 flex flex-col items-center justify-center h-full min-h-[70vh]">
        <div className="text-center bg-white dark:bg-zinc-900 p-10 md:p-16 rounded-2xl border border-gray-200 dark:border-zinc-800 shadow-sm w-full max-w-lg animate-in fade-in zoom-in-95 transition-colors">
          <span className="text-6xl block mb-6 grayscale opacity-40">🗑️</span>
          <h1 className="text-2xl font-serif font-medium text-gray-500 dark:text-zinc-400 mb-2 line-through decoration-gray-300 dark:decoration-zinc-700">{activeNode.label}</h1>
          <p className="text-[10px] font-mono text-gray-400 dark:text-zinc-500 mb-8 uppercase tracking-widest">{activeNode.id}</p>
          <div className="bg-gray-50 dark:bg-zinc-800/50 text-gray-500 dark:text-zinc-400 text-sm p-4 rounded-lg mb-8 leading-relaxed border border-gray-100 dark:border-zinc-800 transition-colors">
            This record is currently in the Trash.<br/>
            Its properties and structural relationships are hidden but fully preserved in the database.
          </div>
          <NodeTrashToggle nodeId={activeNode.id} isActive={false} />
        </div>
      </div>
    );
  }

  let connectedEdges: any[] = [];
  try {
    connectedEdges = await db
      .select()
      .from(edges)
      .where(and(eq(edges.isActive, true), or(eq(edges.sourceId, nodeId), eq(edges.targetId, nodeId))));
  } catch (error: any) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 dark:bg-zinc-950 p-8 transition-colors">
        <div className="text-center max-w-md bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-sm border border-red-100 dark:border-red-900/30 transition-colors">
          <span className="text-5xl block mb-4">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900 dark:text-zinc-100 mb-2">Database Sync Required</h2>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-6">We recently updated the graph engine.</p>
          <div className="bg-gray-900 dark:bg-zinc-950 text-gray-100 dark:text-zinc-300 text-xs font-mono p-4 rounded-lg text-left shadow-inner border border-gray-800 dark:border-zinc-800">npx drizzle-kit push</div>
        </div>
      </div>
    );
  }

  connectedEdges.sort((a, b) => {
    const weightA = a.sourceId === nodeId ? a.sourceSortOrder : a.targetSortOrder;
    const weightB = b.sourceId === nodeId ? b.sourceSortOrder : b.targetSortOrder;
    return (weightA ?? 999) - (weightB ?? 999);
  });

  const connectedNodeIds = new Set<string>();
  connectedEdges.forEach(e => {
    connectedNodeIds.add(e.sourceId);
    connectedNodeIds.add(e.targetId);
  });
  connectedNodeIds.add(nodeId);

  let edgeNodes: any[] = [];
  if (connectedNodeIds.size > 0) {
    edgeNodes = await db.select().from(nodes).where(inArray(nodes.id, Array.from(connectedNodeIds)));
  }

  const recentNodes = await getRecentNodes();
  
  const allNodesMap = new Map();
  recentNodes.forEach(n => allNodesMap.set(n.id, n));
  edgeNodes.forEach(n => allNodesMap.set(n.id, n));
  const allNodes = Array.from(allNodesMap.values());

  const allPredicates = await getAllPredicates();
  const allKinds = await getAllKinds();
  const activeKinds = allKinds.filter(k => k.isActive);

  const nodeProps = (activeNode.properties as Record<string, any>) || {};
  const { isImage, isVideo, isAudio, isYouTube, isWebLink, ytId, webUrl } = getMediaDetails(nodeProps);
  const hasFile = !!nodeProps.fileUrl || isYouTube || isWebLink;

  let secureViewUrl = "";
  if (nodeProps.fileUrl && !isWebLink && !isYouTube) {
    try {
      const filename = nodeProps.fileUrl.split('/').pop();
      if (filename) secureViewUrl = await getSecureMediaUrl(filename);
    } catch (error) {
      console.error("Failed to generate secure read ticket:", error);
    }
  }

  const rawPeekId = params?.peek;
  const peekId = Array.isArray(rawPeekId) ? rawPeekId[0] : rawPeekId;
  let peekNode = null;
  let securePeekUrl = "";
  
  if (peekId) {
    peekNode = allNodes.find(n => n.id === peekId);
    const peekProps = (peekNode?.properties as Record<string, any>) || {};
    const peekMedia = getMediaDetails(peekProps);
    const peekIsWeb = peekMedia.isWebLink || peekMedia.isYouTube;
    
    if (peekNode && peekProps.fileUrl && !peekIsWeb) {
      const filename = peekProps.fileUrl.split('/').pop();
      if (filename) securePeekUrl = await getSecureMediaUrl(filename);
    } else if (peekIsWeb) {
      securePeekUrl = peekMedia.webUrl || peekProps.hash; 
    }
  }

  const isMedia = activeNode.layer === 'MEDIA';
  
  // Use the new shared utility to sort the edges!
  const groups = groupEdges(connectedEdges, activeNode, allNodes);

  // Base props required by all edge blocks
  const edgeContext = {
    currentTab: "", // Tabs removed! Empty string maintains clean URLs
    activeNodeId: activeNode.id,
    sourceNode: activeNode, // Required by UniversalBuilder
    allNodes: allNodes,     // Required by UniversalBuilder
    activeKinds,
    allPredicates,
  };

  return (
    <>
      <div className={`max-w-4xl mx-auto p-4 md:p-12 pb-32 transition-all duration-300 ease-in-out ${peekNode ? 'xl:mr-[28rem]' : ''}`}>
        
        {/* 1. HEADER */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <NodeClassification 
              nodeId={activeNode.id}
              layer={activeNode.layer as any}
              initialKind={activeNode.kind || ''}
              activeKinds={activeKinds} 
            />
            <span className="text-gray-400 dark:text-zinc-500 font-mono text-xs">{activeNode.id}</span>
          </div>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <NodeLabelEditor nodeId={activeNode.id} initialLabel={activeNode.label} />
              <AliasEditor nodeId={activeNode.id} initialAliases={activeNode.aliases || []} />
            </div>
            <div className="flex items-center gap-2 mt-2 md:mt-0 shrink-0">
              <NodeHistoryViewer nodeId={activeNode.id} />
              <NodeTrashToggle nodeId={activeNode.id} isActive={activeNode.isActive} />
            </div>
          </div>
        </div>

        {/* 2. THE MASTER LAYOUT ENGINE */}
        <NodeLayoutEngine
          node={activeNode}
          groups={groups}
          edgeContext={edgeContext}
          propertiesComponent={
            <PropertiesEditor 
              nodeId={activeNode.id} 
              layer={activeNode.layer as any} 
              kind={activeNode.kind || ''} 
              initialProps={nodeProps} 
              allNodes={allNodes} 
              notEarlierThan={activeNode.notEarlierThan} 
              notLaterThan={activeNode.notLaterThan}
            />
          }
          mediaViewerComponent={
            isMedia ? (
              <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-2 shadow-sm mb-6 transition-colors">
                {hasFile ? (
                  <div className="rounded bg-gray-100 dark:bg-zinc-950 overflow-hidden flex items-center justify-center min-h-[300px] transition-colors">
                    {isYouTube ? (
                      <iframe className="w-full max-w-2xl aspect-video rounded shadow-sm m-4" src={`https://www.youtube.com/embed/${ytId}`} allowFullScreen></iframe>
                    ) : isWebLink ? (
                      <div className="p-8 text-center flex flex-col items-center gap-4">
                        <span className="text-5xl block mb-2">🔗</span>
                        <a href={webUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm">Open Web Link ↗</a>
                      </div>
                    ) : secureViewUrl ? (
                      isImage ? <img src={secureViewUrl} alt={activeNode.label} className="max-h-[500px] object-contain" />
                      : isVideo ? <video src={secureViewUrl} controls className="max-h-[500px] w-full object-contain bg-black rounded" />
                      : isAudio ? <audio src={secureViewUrl} controls className="w-full max-w-md m-8" />
                      : <a href={secureViewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline p-8 transition-colors">View Attached File</a>
                    ) : <div className="p-8 text-gray-400 dark:text-zinc-500 animate-pulse text-sm font-bold">Loading secure viewer...</div>}
                  </div>
                ) : (
                  <div className="p-8 text-gray-400 dark:text-zinc-500 italic text-center text-sm border-2 border-dashed border-gray-200 dark:border-zinc-800 rounded-xl bg-gray-50 dark:bg-zinc-800/50 transition-colors">
                    No media payload attached to this record.
                  </div>
                )}
              </div>
            ) : null
          }
        />

      </div>

      <PeekDrawer peekNode={peekNode} activeNodeId={activeNode.id} currentTab="" activeKinds={activeKinds} securePeekUrl={securePeekUrl} allPredicates={allPredicates} />
    </>
  );
}