import { eq, or, and } from "drizzle-orm";
import { db } from "@/db";
import { nodes, edges, SYSTEM_PREDICATES } from "@/db/schema";
import { getSecureMediaUrl, getRecentNodes, getAllKinds, seedSystemPredicates, getAllPredicates } from "@/app/actions";
import MediaUploader from "@/components/MediaUploader";
import RelationBuilder from "@/components/RelationBuilder";
import EdgeRetractButton from "@/components/EdgeRetractButton";
import PropertiesEditor from "@/components/PropertiesEditor";
import NodeClassification from "@/components/NodeClassification";
import AliasEditor from "@/components/AliasEditor";
import NodeHistoryViewer from "@/components/NodeHistoryViewer";
import NodeLabelEditor from "@/components/NodeLabelEditor";
import ContainmentBuilder from "@/components/ContainmentBuilder";
import StructuralBuilder from "@/components/StructuralBuilder";
import PeekDrawer from "@/components/PeekDrawer";
import EdgeRow from "@/components/EdgeRow";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

// Hierarchy mapping for Digital Artifact roles (lower number = closer to identity)
const ROLE_WEIGHTS: Record<string, number> = {
  'digital copy': 1,
  'transcript': 2,
  'translation': 2,
  'primary subject': 3,
  'thumbnail': 4,
  'evidence': 5,
  'mentions': 6,
};

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

  const [activeNode] = await db.select().from(nodes).where(eq(nodes.id, nodeId));
  if (!activeNode) return <div className="p-8 text-red-500">Node not found.</div>;

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
          <p className="text-sm text-gray-600 mb-6">
            We recently updated the graph engine.
          </p>
          <div className="bg-gray-900 text-gray-100 text-xs font-mono p-4 rounded-lg text-left overflow-x-auto shadow-inner">
            npx drizzle-kit push
          </div>
        </div>
      </div>
    );
  }

  connectedEdges.sort((a, b) => {
    const weightA = a.sourceId === nodeId ? a.sourceSortOrder : a.targetSortOrder;
    const weightB = b.sourceId === nodeId ? b.sourceSortOrder : b.targetSortOrder;
    return (weightA ?? 999) - (weightB ?? 999);
  });

  const allNodes = await getRecentNodes();
  const allPredicates = await getAllPredicates();
  const allKinds = await getAllKinds();
  const activeKinds = allKinds.filter(k => k.isActive);

  const nodeProps = (activeNode.properties as Record<string, any>) || {};
  const hasFile = !!nodeProps.fileUrl;
  
  const isImage = hasFile && nodeProps.mimeType?.startsWith('image/');
  const isVideo = hasFile && nodeProps.mimeType?.startsWith('video/');
  const isAudio = hasFile && nodeProps.mimeType?.startsWith('audio/');
  const isWebLink = activeNode.kind === 'WEB_LINK';
  const isYouTube = activeNode.kind === 'YOUTUBE_VIDEO';

  let secureViewUrl = "";
  if (hasFile && !isWebLink && !isYouTube) {
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
    const peekIsWeb = peekNode?.kind === 'WEB_LINK' || peekNode?.kind === 'YOUTUBE_VIDEO';
    
    if (peekNode && peekProps.fileUrl && !peekIsWeb) {
      const filename = peekProps.fileUrl.split('/').pop();
      if (filename) securePeekUrl = await getSecureMediaUrl(filename);
    } else if (peekIsWeb) {
      securePeekUrl = peekProps.fileUrl; 
    }
  }

  // ============================================================================
  // 3-LAYER UI MANIFEST: Routing Edges into Strict UI Blocks
  // ============================================================================
  const isIdentity = activeNode.layer === 'IDENTITY';
  const isPhysical = !isIdentity && (activeNode.kind === 'PHYSICAL_OBJECT' || activeNode.kind === 'PHYSICAL_CONTAINER');
  const isMedia = !isIdentity && !isPhysical;

  const rawTab = params?.tab;
  const currentTab = rawTab ? (Array.isArray(rawTab) ? rawTab[0] : rawTab) : (isIdentity || isPhysical ? 'digital' : 'collections'); 
  
  const physicalHoldings: { edge: any, node: any, isSource: boolean }[] = [];
  const digitalArtifacts: { edge: any, node: any, isSource: boolean }[] = [];
  const mediaAppearances: { edge: any, node: any, isSource: boolean }[] = []; 
  const conceptualSemantics: { edge: any, node: any, isSource: boolean }[] = []; 
  
  // Split structural links out
  const bridgedConcepts: { edge: any, node: any, isSource: boolean }[] = []; // Media/Physical -> CARRIES -> Identity
  const physicalSources: { edge: any, node: any, isSource: boolean }[] = []; // Media -> CARRIES -> Physical
  
  // Split collections
  const containedIn: { edge: any, node: any, isSource: boolean }[] = [];
  const containsItems: { edge: any, node: any, isSource: boolean }[] = [];

  connectedEdges.forEach(edge => {
    const isSource = edge.sourceId === activeNode.id;
    const node = allNodes.find(n => n.id === (isSource ? edge.targetId : edge.sourceId));
    if (!node) return;

    const nodeIsIdentity = node.layer === 'IDENTITY';
    const nodeIsPhysical = !nodeIsIdentity && (node.kind === 'PHYSICAL_OBJECT' || node.kind === 'PHYSICAL_CONTAINER');
    const nodeIsMedia = !nodeIsIdentity && !nodeIsPhysical;

    // 1. STRUCTURAL (CARRIES)
    if (edge.predicateId === SYSTEM_PREDICATES.CARRIES) {
      if (!isSource) {
        // Something is carrying this activeNode
        if (nodeIsPhysical) physicalHoldings.push({ edge, node, isSource });
        else if (nodeIsMedia) digitalArtifacts.push({ edge, node, isSource });
      } else {
        // This activeNode is carrying something
        if (nodeIsIdentity) bridgedConcepts.push({ edge, node, isSource });
        else if (nodeIsPhysical) physicalSources.push({ edge, node, isSource });
      }
    } 
    // 2. AGGREGATION (CONTAINS)
    else if (edge.predicateId === SYSTEM_PREDICATES.CONTAINS) {
      if (isSource) containsItems.push({ edge, node, isSource }); // This node CONTAINS the target
      else containedIn.push({ edge, node, isSource }); // This node is CONTAINED IN the target
    } 
    // 3. SEMANTICS
    else if (edge.predicateId !== SYSTEM_PREDICATES.DERIVED_FROM) {
      if (isMedia) {
        conceptualSemantics.push({ edge, node, isSource });
      } else {
        if (nodeIsMedia) mediaAppearances.push({ edge, node, isSource });
        else conceptualSemantics.push({ edge, node, isSource });
      }
    }
  });

  digitalArtifacts.sort((a, b) => {
    const weightA = ROLE_WEIGHTS[a.edge.role || ''] || 99;
    const weightB = ROLE_WEIGHTS[b.edge.role || ''] || 99;
    return weightA - weightB;
  });

  const physicalHoldingOptions = physicalHoldings.map(h => ({ id: h.node.id, label: h.node.label }));

  return (
    <div className="max-w-4xl mx-auto p-8 md:p-12 pb-32">
      
      {/* 1. HEADER */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <NodeClassification 
            nodeId={activeNode.id}
            layer={activeNode.layer as "IDENTITY" | "INSTANCE"}
            initialKind={activeNode.kind}
            activeKinds={activeKinds} 
          />
          <span className="text-gray-400 font-mono text-xs">{activeNode.id}</span>
        </div>
        
        <div className="flex justify-between items-start">
          <NodeLabelEditor nodeId={activeNode.id} initialLabel={activeNode.label} />
          <NodeHistoryViewer nodeId={activeNode.id} />
        </div>
        
        <AliasEditor nodeId={activeNode.id} initialAliases={activeNode.aliases || []} />
      </div>

      {/* 2. BRIDGED CONCEPT BLOCK (Instances Only) */}
      {!isIdentity && (
        <section className="mb-6 bg-white p-5 border border-blue-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-blue-100 pb-3 mb-4">
             <h2 className="text-sm font-bold text-blue-900 flex items-center gap-2"><span>💡</span> Bridged Concept</h2>
             <StructuralBuilder sourceNodeId={activeNode.id} targetType="IDENTITY" direction="FORWARD" allNodes={allNodes as any} activeKinds={activeKinds} />
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
                key={item.edge.id} 
                edge={item.edge} 
                node={item.node} 
                isSource={item.isSource} 
                predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} 
                currentTab={currentTab} 
                activeNodeId={activeNode.id} 
                activeKinds={activeKinds} 
                hideEdit={true} // CARRIES edges do not have temporal/locator properties
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
            <StructuralBuilder sourceNodeId={activeNode.id} targetType="PHYSICAL" direction="FORWARD" allNodes={allNodes as any} activeKinds={activeKinds} />
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
                key={item.edge.id} 
                edge={item.edge} 
                node={item.node} 
                isSource={item.isSource} 
                predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} 
                currentTab={currentTab} 
                activeNodeId={activeNode.id} 
                activeKinds={activeKinds} 
                hideEdit={true}
              />
            ))}
          </div>
        </section>
      )}

      {/* 3. MEDIA VIEWER (Media Instances Only) */}
      {isMedia && (
        <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm mb-6">
          {hasFile ? (
            <div className="rounded bg-gray-100 overflow-hidden flex items-center justify-center min-h-[300px]">
              {isYouTube ? (
                <iframe 
                  className="w-full max-w-2xl aspect-video rounded shadow-sm m-4" 
                  src={`https://www.youtube.com/embed/${nodeProps.hash?.replace('youtube:', '')}`} 
                  title="YouTube video player" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              ) : isWebLink ? (
                <div className="p-8 text-center flex flex-col items-center gap-4">
                  <span className="text-5xl block mb-2">🔗</span>
                  <a href={nodeProps.fileUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm">
                    Open Web Link ↗
                  </a>
                  <span className="text-xs text-gray-500 font-mono break-all max-w-md bg-white border border-gray-200 p-2 rounded">{nodeProps.fileUrl}</span>
                </div>
              ) : secureViewUrl ? (
                isImage ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={secureViewUrl} alt={activeNode.label} className="max-h-[500px] object-contain" />
                ) : isVideo ? (
                  <video src={secureViewUrl} controls className="max-h-[500px] w-full object-contain bg-black rounded" />
                ) : isAudio ? (
                  <div className="p-8 w-full flex flex-col items-center justify-center gap-4">
                    <span className="text-5xl mb-2">🎵</span>
                    <audio src={secureViewUrl} controls className="w-full max-w-md" />
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <span className="text-4xl block mb-2">📄</span>
                    <a href={secureViewUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium">
                      View Attached File (Secure Link)
                    </a>
                  </div>
                )
              ) : (
                <div className="p-8 text-gray-400 animate-pulse text-sm font-bold tracking-widest uppercase">
                  Loading secure viewer...
                </div>
              )}
            </div>
          ) : (
            <MediaUploader nodeId={activeNode.id} />
          )}
        </div>
      )}

      {/* 4. INTRINSIC PROPERTIES (All Layers) */}
      <PropertiesEditor 
        nodeId={activeNode.id} layer={activeNode.layer as "IDENTITY" | "INSTANCE"}
        kind={activeNode.kind} initialProps={nodeProps} allNodes={allNodes}
        notEarlierThan={activeNode.notEarlierThan} notLaterThan={activeNode.notLaterThan}
      />

      {/* 5. PHYSICAL HOLDINGS BLOCK (Identities Only) */}
      {isIdentity && (
        <section className="mb-8 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>📦</span> Physical Holdings <span className="text-gray-500 font-normal text-xs">({physicalHoldings.length})</span>
            </h2>
            <StructuralBuilder sourceNodeId={activeNode.id} targetType="PHYSICAL" direction="REVERSE" allNodes={allNodes as any} activeKinds={activeKinds} />
          </div>
          <div className="space-y-2">
            {physicalHoldings.length === 0 ? (
               <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No physical holdings mapped.</p>
            ) : physicalHoldings.map(item => (
               <EdgeRow 
                 key={item.edge.id} 
                 edge={item.edge} 
                 node={item.node} 
                 isSource={item.isSource} 
                 predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} 
                 currentTab={currentTab} 
                 activeNodeId={activeNode.id} 
                 activeKinds={activeKinds} 
                 hideEdit={true}
               />
            ))}
          </div>
        </section>
      )}

      {/* 6. CONCEPTUAL SEMANTICS BLOCK (All Layers) */}
      <section className="mb-10 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3 mb-4">
           <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
             <span>{isMedia ? '📍' : '🔗'}</span> {isMedia ? 'Identified Subjects & Semantics' : 'Conceptual Semantics'}
           </h2>
           <RelationBuilder 
             sourceNodeId={activeNode.id} sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
             sourceKind={activeNode.kind} allNodes={allNodes as any} allPredicates={allPredicates} activeKinds={activeKinds}
           />
        </div>
        <div className="space-y-2">
          {conceptualSemantics.length === 0 ? (
            <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No semantic relationships asserted.</p>
          ) : conceptualSemantics.map(item => (
            <EdgeRow 
              key={item.edge.id} 
              edge={item.edge} 
              node={item.node} 
              isSource={item.isSource} 
              predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} 
              currentTab={currentTab} 
              activeNodeId={activeNode.id} 
              activeKinds={activeKinds} 
              hideBadge={false} 
            />
          ))}
        </div>
      </section>

      {/* 7. STRUCTURAL PAYLOAD (The Tabs) */}
      <section>
        
        {/* TABS NAVIGATION */}
        <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
          {(isIdentity || isPhysical) && (
            <>
              <a href={`/?node=${activeNode.id}&tab=digital`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'digital' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
                🖼️ Digital Embodiments <span className="ml-1 opacity-60 font-normal">({digitalArtifacts.length})</span>
              </a>
              <a href={`/?node=${activeNode.id}&tab=appearances`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'appearances' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
                📸 Media Appearances <span className="ml-1 opacity-60 font-normal">({mediaAppearances.length})</span>
              </a>
            </>
          )}
          <a href={`/?node=${activeNode.id}&tab=collections`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'collections' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
            🗂️ Collections & Contents <span className="ml-1 opacity-60 font-normal">({containedIn.length + containsItems.length})</span>
          </a>
        </div>

        {/* TAB CONTENTS */}
        {(isIdentity || isPhysical) && currentTab === 'digital' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
              <MediaUploader identityId={activeNode.id} asButton={true} physicalHoldings={physicalHoldingOptions} />
            </div>
            <div className="space-y-2">
              {digitalArtifacts.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No digital media attached.</p> : digitalArtifacts.map(item => (
                <EdgeRow 
                  key={item.edge.id} 
                  edge={item.edge} 
                  node={item.node} 
                  isSource={item.isSource} 
                  predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} 
                  currentTab={currentTab} 
                  activeNodeId={activeNode.id} 
                  activeKinds={activeKinds} 
                  hideBadge={true}
                  hideEdit={true}
                />
              ))}
            </div>
          </div>
        )}

        {(isIdentity || isPhysical) && currentTab === 'appearances' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
              <RelationBuilder 
                sourceNodeId={activeNode.id} sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
                sourceKind={activeNode.kind} allNodes={allNodes as any} allPredicates={allPredicates} activeKinds={activeKinds}
              />
            </div>
            <div className="space-y-2">
              {mediaAppearances.length === 0 ? (
                <div className="text-center p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 italic mb-2">Not currently tagged in any media.</p>
                  <p className="text-[10px] text-gray-400 font-medium">To log an appearance, assert a semantic link to a Photo or Video!</p>
                </div>
              ) : mediaAppearances.map(item => (
                <EdgeRow 
                  key={item.edge.id} 
                  edge={item.edge} 
                  node={item.node} 
                  isSource={item.isSource} 
                  predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'UNKNOWN', reverseLabel: 'UNKNOWN', isSystem: false }} 
                  currentTab={currentTab} 
                  activeNodeId={activeNode.id} 
                  activeKinds={activeKinds} 
                  hideBadge={false} 
                />
              ))}
            </div>
          </div>
        )}

        {currentTab === 'collections' && (
          <div className="animate-in fade-in space-y-8">
            
            {/* 1. Contained In (Where does this live?) */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-3 border-b border-gray-100 pb-1">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                  Contained In (Locations & Collections)
                </h3>
                <ContainmentBuilder 
                    sourceNodeId={activeNode.id} 
                    sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
                    sourceKind={activeNode.kind}
                    allNodes={allNodes as any} 
                    activeKinds={activeKinds}
                    label="Add Location"
                    direction="CONTAINED_IN"
                />
              </div>
              <div className="space-y-2">
                {containedIn.length === 0 ? (
                  <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50 text-center">
                    Not part of any collection or container.
                  </p>
                ) : containedIn.map(item => (
                  <EdgeRow 
                    key={item.edge.id} 
                    edge={item.edge} 
                    node={item.node} 
                    isSource={item.isSource} 
                    predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} 
                    currentTab={currentTab} 
                    activeNodeId={activeNode.id} 
                    activeKinds={activeKinds} 
                    hideBadge={false}
                    hideEdit={true}
                  />
                ))}
              </div>
            </div>

            {/* 2. Contains (What lives inside this?) - Blocked for Media */}
            {(!isMedia) && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-4 mb-3 border-b border-gray-100 pb-1">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    Contents & Items
                  </h3>
                  <ContainmentBuilder 
                    sourceNodeId={activeNode.id} 
                    sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
                    sourceKind={activeNode.kind}
                    allNodes={allNodes as any} 
                    activeKinds={activeKinds} 
                  />
                </div>
                <div className="space-y-2">
                  {containsItems.length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50 text-center">
                      No contents mapped inside this record.
                    </p>
                  ) : containsItems.map(item => (
                    <EdgeRow 
                      key={item.edge.id} 
                      edge={item.edge} 
                      node={item.node} 
                      isSource={item.isSource} 
                      predDef={allPredicates.find(p => p.id === item.edge.predicateId) || { forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} 
                      currentTab={currentTab} 
                      activeNodeId={activeNode.id} 
                      activeKinds={activeKinds} 
                      hideBadge={false}
                      hideEdit={true} 
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </section>

      {/* PEEK DRAWER (Global Overlay) */}
      <PeekDrawer 
        peekNode={peekNode} 
        activeNodeId={activeNode.id} 
        currentTab={currentTab}
        activeKinds={activeKinds}
        securePeekUrl={securePeekUrl}
      />

    </div>
  );
}