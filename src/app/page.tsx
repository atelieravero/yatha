import { eq, or, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { nodes, edges, SYSTEM_PREDICATES } from "@/db/schema";
import { getSecureMediaUrl, getRecentNodes, getAllKinds, seedSystemPredicates, getAllPredicates } from "@/app/actions";
import { getMediaDetails } from "@/lib/mediaUtils";
import MediaUploader from "@/components/MediaUploader";
import UniversalBuilder from "@/components/UniversalBuilder";
import PropertiesEditor from "@/components/PropertiesEditor";
import NodeClassification from "@/components/NodeClassification";
import AliasEditor from "@/components/AliasEditor";
import NodeHistoryViewer from "@/components/NodeHistoryViewer";
import NodeLabelEditor from "@/components/NodeLabelEditor";
import PeekDrawer from "@/components/PeekDrawer";
import EdgeRow from "@/components/EdgeRow";
import NodeTrashToggle from "@/components/NodeTrashToggle";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ node?: string | string[]; tab?: string | string[]; peek?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawNodeId = params?.node;
  const nodeId = Array.isArray(rawNodeId) ? rawNodeId[0] : rawNodeId;

  await seedSystemPredicates();

  if (!nodeId) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 text-gray-400 p-8">
        <div className="text-center">
          <span className="text-4xl block mb-4">✨</span>
          <p>Select an item from the sidebar to open the workspace.</p>
        </div>
      </div>
    );
  }

  const [rawActiveNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!rawActiveNode) return <div className="p-8 text-red-500">Node not found.</div>;

  // Safely cast the database node to match the strict MinimalNode interface
  const activeNode = {
    ...rawActiveNode,
    layer: rawActiveNode.layer as "IDENTITY" | "PHYSICAL" | "MEDIA",
    properties: (rawActiveNode.properties as Record<string, any>) || {}
  };

  // ============================================================================
  // TOMBSTONE INTERCEPTOR
  // If the node is in the trash, short-circuit the heavy graph queries!
  // ============================================================================
  if (!activeNode.isActive) {
    return (
      <div className="max-w-4xl mx-auto p-8 md:p-12 pb-32 flex flex-col items-center justify-center h-full min-h-[70vh]">
        <div className="text-center bg-white p-10 md:p-16 rounded-2xl border border-gray-200 shadow-sm w-full max-w-lg animate-in fade-in zoom-in-95">
          <span className="text-6xl block mb-6 grayscale opacity-40">🗑️</span>
          <h1 className="text-2xl font-serif font-medium text-gray-500 mb-2 line-through decoration-gray-300">{activeNode.label}</h1>
          <p className="text-[10px] font-mono text-gray-400 mb-8 uppercase tracking-widest">{activeNode.id}</p>
          <div className="bg-gray-50 text-gray-500 text-sm p-4 rounded-lg mb-8 leading-relaxed border border-gray-100">
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
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <div className="text-center max-w-md bg-white p-8 rounded-2xl shadow-sm border border-red-100">
          <span className="text-5xl block mb-4">⚠️</span>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Database Sync Required</h2>
          <p className="text-sm text-gray-600 mb-6">We recently updated the graph engine.</p>
          <div className="bg-gray-900 text-gray-100 text-xs font-mono p-4 rounded-lg text-left shadow-inner">npx drizzle-kit push</div>
        </div>
      </div>
    );
  }

  connectedEdges.sort((a, b) => {
    const weightA = a.sourceId === nodeId ? a.sourceSortOrder : a.targetSortOrder;
    const weightB = b.sourceId === nodeId ? b.sourceSortOrder : b.targetSortOrder;
    return (weightA ?? 999) - (weightB ?? 999);
  });

  // ============================================================================
  // PAGINATION BLINDSPOT FIX
  // Ensure we explicitly fetch the exact nodes connected via edges, 
  // bypassing the getRecentNodes 50-item limit.
  // ============================================================================
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
  
  // Merge recent nodes with explicitly required edge nodes to form the complete dictionary
  const allNodesMap = new Map();
  recentNodes.forEach(n => allNodesMap.set(n.id, n));
  edgeNodes.forEach(n => allNodesMap.set(n.id, n));
  const allNodes = Array.from(allNodesMap.values());
  // ============================================================================

  const allPredicates = await getAllPredicates();
  const allKinds = await getAllKinds();
  const activeKinds = allKinds.filter(k => k.isActive);

  const nodeProps = (activeNode.properties as Record<string, any>) || {};
  
  // Centralized media parsing logic
  const { isImage, isVideo, isAudio, isYouTube, isWebLink, ytId, webUrl } = getMediaDetails(nodeProps);

  // Prevent rendering the Upload box if we have a valid fileUrl OR an external link
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

  // ============================================================================
  // PEEK DRAWER STATE
  // ============================================================================
  const rawPeekId = params?.peek;
  const peekId = Array.isArray(rawPeekId) ? rawPeekId[0] : rawPeekId;
  let peekNode = null;
  let securePeekUrl = "";
  
  if (peekId) {
    peekNode = allNodes.find(n => n.id === peekId);
    const peekProps = (peekNode?.properties as Record<string, any>) || {};
    
    // Centralized media parsing logic for the peeked node
    const peekMedia = getMediaDetails(peekProps);
    const peekIsWeb = peekMedia.isWebLink || peekMedia.isYouTube;
    
    if (peekNode && peekProps.fileUrl && !peekIsWeb) {
      const filename = peekProps.fileUrl.split('/').pop();
      if (filename) securePeekUrl = await getSecureMediaUrl(filename);
    } else if (peekIsWeb) {
      securePeekUrl = peekMedia.webUrl || peekProps.hash; 
    }
  }

  // ============================================================================
  // PURE 3-LAYER UI MANIFEST ROUTING
  // ============================================================================
  const isIdentity = activeNode.layer === 'IDENTITY';
  const isPhysical = activeNode.layer === 'PHYSICAL';
  const isMedia = activeNode.layer === 'MEDIA';

  const rawTab = params?.tab;
  const currentTab = rawTab ? (Array.isArray(rawTab) ? rawTab[0] : rawTab) : (isIdentity || isPhysical ? 'digital' : 'collections'); 
  
  const physicalHoldings: { edge: any, node: any, isSource: boolean }[] = [];
  const digitalArtifacts: { edge: any, node: any, isSource: boolean }[] = [];
  const mediaAppearances: { edge: any, node: any, isSource: boolean }[] = []; 
  const conceptualSemantics: { edge: any, node: any, isSource: boolean }[] = []; 
  
  const bridgedConcepts: { edge: any, node: any, isSource: boolean }[] = []; 
  const physicalSources: { edge: any, node: any, isSource: boolean }[] = []; 
  
  const containedIn: { edge: any, node: any, isSource: boolean }[] = [];
  const containsItems: { edge: any, node: any, isSource: boolean }[] = [];

  connectedEdges.forEach(edge => {
    const isSource = edge.sourceId === activeNode.id;
    const node = allNodes.find(n => n.id === (isSource ? edge.targetId : edge.sourceId));
    if (!node) return;

    const nodeIsIdentity = node.layer === 'IDENTITY';
    const nodeIsPhysical = node.layer === 'PHYSICAL';
    const nodeIsMedia = node.layer === 'MEDIA';

    if (edge.predicateId === SYSTEM_PREDICATES.CARRIES) {
      if (!isSource) {
        if (nodeIsPhysical) physicalHoldings.push({ edge, node, isSource });
        else if (nodeIsMedia) digitalArtifacts.push({ edge, node, isSource });
      } else {
        if (nodeIsIdentity) bridgedConcepts.push({ edge, node, isSource });
        else if (nodeIsPhysical) physicalSources.push({ edge, node, isSource });
      }
    } 
    else if (edge.predicateId === SYSTEM_PREDICATES.CONTAINS) {
      if (isSource) containsItems.push({ edge, node, isSource });
      else containedIn.push({ edge, node, isSource });
    } 
    else {
      if (isMedia) conceptualSemantics.push({ edge, node, isSource });
      else {
        if (nodeIsMedia) mediaAppearances.push({ edge, node, isSource });
        else conceptualSemantics.push({ edge, node, isSource });
      }
    }
  });

  return (
    <>
      <div className={`max-w-4xl mx-auto p-8 md:p-12 pb-32 transition-all duration-300 ease-in-out ${peekNode ? 'xl:mr-[28rem]' : ''}`}>
        
        {/* 1. HEADER */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <NodeClassification 
              nodeId={activeNode.id}
              layer={activeNode.layer as any}
              initialKind={activeNode.kind || ''}
              activeKinds={activeKinds} 
            />
            <span className="text-gray-400 font-mono text-xs">{activeNode.id}</span>
          </div>
          
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <NodeLabelEditor nodeId={activeNode.id} initialLabel={activeNode.label} />
              <AliasEditor nodeId={activeNode.id} initialAliases={activeNode.aliases || []} />
            </div>
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 mt-2 sm:mt-0 shrink-0">
              <NodeHistoryViewer nodeId={activeNode.id} />
              <NodeTrashToggle nodeId={activeNode.id} isActive={activeNode.isActive} />
            </div>
          </div>
        </div>

        {/* 2a. BRIDGED CONCEPTS BLOCK (Physical & Media Only) */}
        {(isPhysical || isMedia) && (
          <section className="mb-6 bg-white p-5 border border-blue-200 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-blue-900 flex items-center gap-2"><span>💡</span> Bridged Concept</h2>
              <UniversalBuilder 
                sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                config={{
                  mode: 'STRUCTURAL', direction: 'FORWARD', allowedGateways: ['IDENTITY'],
                  buttonLabel: 'Link Concept', modalTitle: 'Bridged Concept', icon: '💡', theme: 'blue', hideEdgeProperties: true
                }}
              />
            </div>
            <div className="space-y-2">
              {bridgedConcepts.length === 0 ? (
                <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center gap-3 opacity-60">
                  <span className="text-2xl">🟣</span>
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Orphaned Artifact</div>
                    <span className="font-serif text-sm font-medium text-gray-600">Not linked to a Layer 1 Concept.</span>
                  </div>
                </div>
              ) : bridgedConcepts.map(item => (
                <EdgeRow 
                  key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} 
                  predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} 
                  currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideEdit={true} hideBadge={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* 2b. PHYSICAL SOURCE BLOCK (Media Only) */}
        {isMedia && (
          <section className="mb-6 bg-white p-5 border border-amber-200 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-amber-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-amber-900 flex items-center gap-2"><span>📦</span> Physical Source Material</h2>
              <UniversalBuilder 
                sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                config={{
                  mode: 'STRUCTURAL', direction: 'FORWARD', allowedGateways: ['PHYSICAL'],
                  buttonLabel: 'Link Source', modalTitle: 'Physical Source Material', icon: '📦', theme: 'amber', hideEdgeProperties: true
                }}
              />
            </div>
            <div className="space-y-2">
              {physicalSources.length === 0 ? (
                <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center gap-3 opacity-60">
                  <span className="text-2xl">☁️</span>
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Digital Native</div>
                    <span className="font-serif text-sm font-medium text-gray-600">Not directly digitized from a physical holding.</span>
                  </div>
                </div>
              ) : physicalSources.map(item => (
                <EdgeRow 
                  key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} 
                  predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} 
                  currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideEdit={true} hideBadge={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* 3. MEDIA VIEWER (Media Only) */}
        {isMedia && (
          <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm mb-6">
            {hasFile ? (
              <div className="rounded bg-gray-100 overflow-hidden flex items-center justify-center min-h-[300px]">
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
                  : <a href={secureViewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline p-8">View Attached File</a>
                ) : <div className="p-8 text-gray-400 animate-pulse text-sm font-bold">Loading secure viewer...</div>}
              </div>
            ) : (
              <MediaUploader nodeId={activeNode.id} />
            )}
          </div>
        )}

        {/* 4. INTRINSIC PROPERTIES (All Layers) */}
        <PropertiesEditor 
          nodeId={activeNode.id} layer={activeNode.layer as any} kind={activeNode.kind || ''} 
          initialProps={nodeProps} allNodes={allNodes} notEarlierThan={activeNode.notEarlierThan} notLaterThan={activeNode.notLaterThan}
        />

        {/* 5. PHYSICAL HOLDINGS BLOCK (Identities Only) */}
        {isIdentity && (
          <section className="mb-8 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3 mb-4">
              <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><span>📦</span> Physical Holdings <span className="text-gray-500 font-normal text-xs">({physicalHoldings.length})</span></h2>
              <UniversalBuilder 
                sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                config={{
                  mode: 'STRUCTURAL', direction: 'REVERSE', allowedGateways: ['PHYSICAL'],
                  buttonLabel: 'Add Holding', modalTitle: 'Physical Holdings', icon: '📦', theme: 'amber', hideEdgeProperties: true
                }}
              />
            </div>
            <div className="space-y-2">
              {physicalHoldings.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No physical holdings mapped.</p>
              : physicalHoldings.map(item => (
                 <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideEdit={true} />
              ))}
            </div>
          </section>
        )}

        {/* 6. CONCEPTUAL SEMANTICS BLOCK (All Layers) */}
        <section className="mb-10 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3 mb-4">
             <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2"><span>{isMedia ? '📍' : '🔗'}</span> {isMedia ? 'Identified Subjects & Semantics' : 'Conceptual Semantics'}</h2>
             <UniversalBuilder 
               sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds} allPredicates={allPredicates}
               config={{
                 mode: 'SEMANTIC', // REMOVED: direction
                 // Rule: Identity can't use Media in this block (uses Appearances tab instead). Physical can't use Physical. Media can't use Media.
                 allowedGateways: isIdentity ? ['IDENTITY', 'PHYSICAL'] : (isPhysical ? ['IDENTITY', 'FILE', 'URL'] : ['IDENTITY', 'PHYSICAL']),
                 buttonLabel: 'Assert Link', modalTitle: 'Semantic Connection', icon: '🔗', theme: 'emerald', hideEdgeProperties: false
               }}
             />
          </div>
          <div className="space-y-2">
            {conceptualSemantics.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No semantic relationships asserted.</p>
            : conceptualSemantics.map(item => (
              <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideBadge={false} />
            ))}
          </div>
        </section>

        {/* 7. STRUCTURAL PAYLOAD (The Tabs) */}
        <section>
          <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
            {(isIdentity || isPhysical) && (
              <>
                <a href={`/?node=${activeNode.id}&tab=digital`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'digital' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>🖼️ Digital Embodiments <span className="ml-1 opacity-60 font-normal">({digitalArtifacts.length})</span></a>
                <a href={`/?node=${activeNode.id}&tab=appearances`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'appearances' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>📸 Media Appearances <span className="ml-1 opacity-60 font-normal">({mediaAppearances.length})</span></a>
              </>
            )}
            <a href={`/?node=${activeNode.id}&tab=collections`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'collections' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>🗂️ Collections & Contents <span className="ml-1 opacity-60 font-normal">({containedIn.length + containsItems.length})</span></a>
          </div>

          {(isIdentity || isPhysical) && currentTab === 'digital' && (
            <div className="animate-in fade-in">
              <div className="flex justify-end mb-3">
                <UniversalBuilder 
                  sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                  config={{
                    mode: 'STRUCTURAL', direction: 'REVERSE', allowedGateways: ['FILE', 'URL'],
                    buttonLabel: 'Add Artifact', modalTitle: 'Digital Artifact', icon: '🖼️', theme: 'blue', hideEdgeProperties: true
                  }}
                />
              </div>
              <div className="space-y-2">
                {digitalArtifacts.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No digital media attached.</p> : digitalArtifacts.map(item => (
                  <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={{ forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideBadge={true} hideEdit={true} />
                ))}
              </div>
            </div>
          )}

          {(isIdentity || isPhysical) && currentTab === 'appearances' && (
            <div className="animate-in fade-in">
              <div className="flex justify-end mb-3">
                <UniversalBuilder 
                   sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds} allPredicates={allPredicates}
                   config={{
                     mode: 'SEMANTIC', // REMOVED: direction
                     allowedGateways: ['FILE', 'URL'],
                     buttonLabel: 'Tag in Media', modalTitle: 'Media Appearance', icon: '📸', theme: 'emerald', hideEdgeProperties: false
                   }}
                 />
              </div>
              <div className="space-y-2">
                {mediaAppearances.length === 0 ? <div className="text-center p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50"><p className="text-xs text-gray-400 italic mb-2">Not currently tagged in any media.</p></div> : mediaAppearances.map(item => (
                  <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} />
                ))}
              </div>
            </div>
          )}

          {currentTab === 'collections' && (
            <div className="animate-in fade-in space-y-8">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3 border-b border-gray-100 pb-1">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Contained In (Locations & Collections)</h3>
                  <UniversalBuilder 
                    sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                    config={{
                      mode: 'CONTAINMENT', direction: 'REVERSE', allowedGateways: ['IDENTITY', 'PHYSICAL'],
                      buttonLabel: 'Add Location', modalTitle: 'Contained In', icon: '📥', theme: 'blue', hideEdgeProperties: true
                    }}
                  />
                </div>
                <div className="space-y-2">
                  {containedIn.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50 text-center">Not part of any collection or container.</p> : containedIn.map(item => (
                    <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideEdit={true} />
                  ))}
                </div>
              </div>

              {(!isMedia) && (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-3 border-b border-gray-100 pb-1">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Contents & Items</h3>
                    <UniversalBuilder 
                      sourceNode={activeNode} allNodes={allNodes as any} activeKinds={activeKinds}
                      config={{
                        mode: 'CONTAINMENT', direction: 'FORWARD', allowedGateways: isIdentity ? ['IDENTITY', 'PHYSICAL', 'FILE', 'URL'] : ['PHYSICAL'],
                        buttonLabel: 'Add Item', modalTitle: 'Contents & Items', icon: '📥', theme: 'blue', hideEdgeProperties: true
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    {containsItems.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50 text-center">No contents mapped inside this record.</p> : containsItems.map(item => (
                      <EdgeRow key={item.edge.id} edge={item.edge} node={item.node} isSource={item.isSource} predDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} currentTab={currentTab} activeNodeId={activeNode.id} activeKinds={activeKinds} hideEdit={true} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      <PeekDrawer peekNode={peekNode} activeNodeId={activeNode.id} currentTab={currentTab} activeKinds={activeKinds} securePeekUrl={securePeekUrl} />
    </>
  );
}