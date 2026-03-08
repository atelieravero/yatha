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
import PhysicalHoldingBuilder from "@/components/PhysicalHoldingBuilder";
import ContainmentBuilder from "@/components/ContainmentBuilder";
import PeekDrawer from "@/components/PeekDrawer";
import EdgeRow from "@/components/EdgeRow";
import ReferenceRow from "@/components/ReferenceRow";
import MediaReferenceBuilder from "@/components/MediaReferenceBuilder";

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
  
  // Safely normalize arrays to strings if multiple params are present
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
            We recently updated the graph engine to support positional references, but your local database is missing the new <code className="bg-gray-100 px-1 py-0.5 rounded text-red-500">properties</code> column on the edges table.
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
  
  // Format detection for native players
  const isImage = hasFile && nodeProps.mimeType?.startsWith('image/');
  const isVideo = hasFile && nodeProps.mimeType?.startsWith('video/');
  const isAudio = hasFile && nodeProps.mimeType?.startsWith('audio/');
  
  // Intercept external URLs so we don't request Cloudflare tickets for them
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
  // THE UI MANIFEST: Routing Edges into UX Blocks
  // ============================================================================
  const isIdentity = activeNode.layer === 'IDENTITY';
  const isPhysical = !isIdentity && (activeNode.kind === 'PHYSICAL_OBJECT' || activeNode.kind === 'PHYSICAL_CONTAINER');
  const isMedia = !isIdentity && !isPhysical;

  // Set smart default tabs based on the actual node state
  const rawTab = params?.tab;
  const currentTab = rawTab ? (Array.isArray(rawTab) ? rawTab[0] : rawTab) : (isIdentity ? 'digital' : (isPhysical ? 'appearances' : 'subjects')); 
  
  const physicalHoldings: { edge: any, node: any, isSource: boolean }[] = [];
  const digitalArtifacts: { edge: any, node: any, isSource: boolean }[] = [];
  const mediaAppearances: { edge: any, node: any, isSource: boolean }[] = []; 
  const identifiedSubjects: { edge: any, node: any, isSource: boolean }[] = []; 
  const structuralCollections: { edge: any, node: any, isSource: boolean }[] = [];
  const conceptualLinks: { edge: any, node: any, isSource: boolean }[] = [];
  const containerContents: { edge: any, node: any, isSource: boolean }[] = [];
  const semanticEdges: { edge: any, node: any, isSource: boolean }[] = [];

  connectedEdges.forEach(edge => {
    const isSource = edge.sourceId === activeNode.id;
    const node = allNodes.find(n => n.id === (isSource ? edge.targetId : edge.sourceId));
    if (!node) return;

    // 1. Intercept REFERENCES for our new Media Tags blocks
    if (edge.predicateId === SYSTEM_PREDICATES.REFERENCES) {
      if (!isSource) {
        // This node is the Subject (Identity or Physical Object) being referenced
        mediaAppearances.push({ edge, node, isSource });
      } else {
        // This node is the Media referencing the other subject
        identifiedSubjects.push({ edge, node, isSource });
      }
      return;
    }

    // 2. Standard Routing
    if (isIdentity) {
      if (!isSource && edge.predicateId === SYSTEM_PREDICATES.CARRIES) {
        if (node.kind === 'PHYSICAL_OBJECT' || node.kind === 'PHYSICAL_CONTAINER') physicalHoldings.push({ edge, node, isSource });
        else digitalArtifacts.push({ edge, node, isSource });
      } else if (isSource && edge.predicateId === SYSTEM_PREDICATES.CONTAINS) {
        structuralCollections.push({ edge, node, isSource });
      } else {
        semanticEdges.push({ edge, node, isSource });
      }
    } else {
      if (isSource && edge.predicateId === SYSTEM_PREDICATES.CARRIES) {
        conceptualLinks.push({ edge, node, isSource });
      } else if (isSource && edge.predicateId === SYSTEM_PREDICATES.CONTAINS) {
        containerContents.push({ edge, node, isSource });
      } else {
        semanticEdges.push({ edge, node, isSource });
      }
    }
  });

  digitalArtifacts.sort((a, b) => {
    const weightA = ROLE_WEIGHTS[a.edge.role || ''] || 99;
    const weightB = ROLE_WEIGHTS[b.edge.role || ''] || 99;
    return weightA - weightB;
  });

  const physicalHoldingOptions = physicalHoldings.map(h => ({ id: h.node.id, label: h.node.label }));

  const getIcon = (node: any) => {
    if (node.layer === 'INSTANCE') return FORMAT_ICONS[node.kind] || '📦';
    const kindDef = activeKinds.find(k => k.id === node.kind);
    return kindDef?.icon || '🟣';
  };

  const getKindLabel = (node: any) => {
    if (node.layer === 'INSTANCE') return (node.kind || '').replace('_', ' ');
    const kindDef = activeKinds.find(k => k.id === node.kind);
    return kindDef?.label || 'Concept';
  };

  const renderPhysicalHoldingRow = ({ edge, node }: any) => {
    const props = node.properties || {};
    return (
      <div key={edge.id} className="group p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex justify-between items-start">
        <div className="overflow-hidden">
          <a href={`/?node=${activeNode.id}&tab=${currentTab}&peek=${node.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600 hover:underline flex items-center gap-1.5 cursor-pointer mb-1.5 max-w-full">
            <span className="opacity-80 text-xs shrink-0" title={getKindLabel(node)}>{getIcon(node)}</span>
            <span className="truncate block">
              {node.label}
              {node.aliases && node.aliases.length > 0 && (
                <span className="text-gray-400 font-normal ml-1.5 text-xs">({node.aliases.join(', ')})</span>
              )}
            </span>
          </a>
          
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider font-bold">
            {props.location && (
              <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">📍 {props.location}</span>
            )}
            {props.call_number && (
              <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 font-mono">#️⃣ {props.call_number}</span>
            )}
            {props.condition && (
              <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">🔍 {props.condition}</span>
            )}
          </div>
        </div>
        <EdgeRetractButton edgeId={edge.id} />
      </div>
    );
  };

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

      {/* 2. CONCEPTUAL LINK BANNER (Instances Only) */}
      {!isIdentity && (
        <div className="mb-6">
          {conceptualLinks.map(({edge, node}) => (
            <div key={edge.id} className="p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{getIcon(node)}</span>
                <div>
                  <div className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mb-0.5">Bridged Identity</div>
                  <a href={`/?node=${activeNode.id}&tab=${currentTab}&peek=${node.id}`} className="font-serif text-xl font-medium text-blue-900 hover:underline">{node.label}</a>
                </div>
              </div>
              <EdgeRetractButton edgeId={edge.id} />
            </div>
          ))}
          {conceptualLinks.length === 0 && (
            <div className="p-4 bg-gray-50 border border-dashed border-gray-300 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3 opacity-60">
                <span className="text-2xl">🟣</span>
                <div>
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">Orphaned Artifact</div>
                  <span className="font-serif text-lg font-medium text-gray-600">Not linked to a concept.</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. MEDIA VIEWER (Instances Only) */}
      {!isIdentity && isMedia && (
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

      {/* 4. INTRINSIC PROPERTIES */}
      <PropertiesEditor 
        nodeId={activeNode.id} layer={activeNode.layer as "IDENTITY" | "INSTANCE"}
        kind={activeNode.kind} initialProps={nodeProps} allNodes={allNodes}
        notEarlierThan={activeNode.notEarlierThan} notLaterThan={activeNode.notLaterThan}
      />

      {/* 5. PHYSICAL HOLDINGS (Identities Only) */}
      {isIdentity && physicalHoldings.length === 0 ? (
        <section className="mb-8 bg-white px-5 py-3 border border-gray-200 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-4 transition-all">
          <h2 className="text-sm font-bold text-gray-400 flex items-center gap-2">
            <span>📦</span> Physical Holdings <span className="font-normal text-xs">(0)</span>
          </h2>
          <PhysicalHoldingBuilder identityId={activeNode.id} identityLabel={activeNode.label} />
        </section>
      ) : isIdentity && (
        <section className="mb-8 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 mb-4">
            <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <span>📦</span> Physical Holdings <span className="text-gray-500 font-normal text-xs">({physicalHoldings.length})</span>
            </h2>
            <PhysicalHoldingBuilder identityId={activeNode.id} identityLabel={activeNode.label} />
          </div>
          <div className="space-y-2">
            {physicalHoldings.map(item => renderPhysicalHoldingRow(item))}
          </div>
        </section>
      )}

      {/* 6. SEMANTIC CONNECTIONS (Identities Only) */}
      {isIdentity && (
        <section className="mb-10 bg-white p-6 border border-gray-200 rounded-xl shadow-sm">
          <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3 mb-4 flex items-center gap-2">
            <span>🔗</span> Semantic Connections
          </h2>
          <div className="space-y-2 mb-4">
            {semanticEdges.length === 0 ? (
              <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No semantic tags or relationships asserted.</p>
            ) : semanticEdges.map(item => (
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
          <RelationBuilder 
            sourceNodeId={activeNode.id} sourceLayer="IDENTITY" 
            sourceKind={activeNode.kind} allNodes={allNodes as any} allPredicates={allPredicates} activeKinds={activeKinds}
          />
        </section>
      )}

      {/* 7. STRUCTURAL PAYLOAD (The Tabs) */}
      <section>
        {/* IDENTITY TABS */}
        {isIdentity && (
          <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
            <a href={`/?node=${activeNode.id}&tab=digital`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'digital' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
              🖼️ Digital Embodiments <span className="ml-1 opacity-60 font-normal">({digitalArtifacts.length})</span>
            </a>
            <a href={`/?node=${activeNode.id}&tab=appearances`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'appearances' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
              📍 Media Appearances <span className="ml-1 opacity-60 font-normal">({mediaAppearances.length})</span>
            </a>
            <a href={`/?node=${activeNode.id}&tab=collection`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'collection' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
              🗂️ Curated Collection <span className="ml-1 opacity-60 font-normal">({structuralCollections.length})</span>
            </a>
          </div>
        )}

        {/* INSTANCE TABS */}
        {!isIdentity && (
          <div className="flex gap-6 border-b border-gray-200 mb-6 overflow-x-auto no-scrollbar">
            {isMedia && (
              <a href={`/?node=${activeNode.id}&tab=subjects`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'subjects' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
                📍 Identified Subjects <span className="ml-1 opacity-60 font-normal">({identifiedSubjects.length})</span>
              </a>
            )}
            {isPhysical && (
              <a href={`/?node=${activeNode.id}&tab=appearances`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'appearances' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-gray-500 hover:text-gray-800'}`}>
                📸 Media Appearances <span className="ml-1 opacity-60 font-normal">({mediaAppearances.length})</span>
              </a>
            )}
            {activeNode.kind === 'PHYSICAL_CONTAINER' && (
              <a href={`/?node=${activeNode.id}&tab=contents`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'contents' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
                📥 Contents <span className="ml-1 opacity-60 font-normal">({containerContents.length})</span>
              </a>
            )}
            <a href={`/?node=${activeNode.id}&tab=semantic`} className={`pb-2 text-sm font-bold whitespace-nowrap transition-colors ${currentTab === 'semantic' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}>
              🔗 Semantic Connections <span className="ml-1 opacity-60 font-normal">({semanticEdges.length})</span>
            </a>
          </div>
        )}

        {/* ========================================================================= */}
        {/* IDENTITY TAB CONTENTS                                                     */}
        {/* ========================================================================= */}
        {isIdentity && currentTab === 'digital' && (
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
                />
              ))}
            </div>
          </div>
        )}

        {(isIdentity || isPhysical) && currentTab === 'appearances' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
              <MediaReferenceBuilder 
                sourceNodeId={activeNode.id} 
                sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
                sourceKind={activeNode.kind}
                allNodes={allNodes as any} 
                activeKinds={activeKinds} 
              />
            </div>
            <div className="space-y-2">
              {mediaAppearances.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No media appearances logged.</p> : mediaAppearances.map(item => (
                <ReferenceRow 
                  key={item.edge.id} 
                  edge={item.edge} 
                  node={item.node} 
                  isSource={item.isSource} 
                  currentTab={currentTab} 
                  activeNodeId={activeNode.id} 
                  activeKinds={activeKinds} 
                />
              ))}
            </div>
          </div>
        )}

        {isIdentity && currentTab === 'collection' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
               <ContainmentBuilder sourceNodeId={activeNode.id} sourceLayer="IDENTITY" allNodes={allNodes as any} activeKinds={activeKinds} />
            </div>
            <div className="space-y-2">
              {structuralCollections.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">This concept does not contain any sub-items.</p> : structuralCollections.map(item => (
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
                />
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* INSTANCE TAB CONTENTS                                                     */}
        {/* ========================================================================= */}
        {!isIdentity && isMedia && currentTab === 'subjects' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
               <MediaReferenceBuilder 
                sourceNodeId={activeNode.id} 
                sourceLayer="INSTANCE" 
                sourceKind={activeNode.kind}
                allNodes={allNodes as any} 
                activeKinds={activeKinds} 
              />
            </div>
            <div className="space-y-2">
              {identifiedSubjects.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No subjects tagged in this media.</p> : identifiedSubjects.map(item => (
                <ReferenceRow 
                  key={item.edge.id} 
                  edge={item.edge} 
                  node={item.node} 
                  isSource={item.isSource} 
                  currentTab={currentTab} 
                  activeNodeId={activeNode.id} 
                  activeKinds={activeKinds} 
                />
              ))}
            </div>
          </div>
        )}

        {!isIdentity && currentTab === 'appearances' && (
          <div className="animate-in fade-in">
            <div className="space-y-2">
              {mediaAppearances.length === 0 ? (
                <div className="text-center p-4 border border-dashed border-gray-200 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 italic mb-2">This physical artifact hasn't been tagged in any other media.</p>
                  <p className="text-[10px] text-gray-400 font-medium">To log an appearance, open a Photo or Video and tag this item as a subject!</p>
                </div>
              ) : mediaAppearances.map(item => (
                <ReferenceRow 
                  key={item.edge.id} 
                  edge={item.edge} 
                  node={item.node} 
                  isSource={item.isSource} 
                  currentTab={currentTab} 
                  activeNodeId={activeNode.id} 
                  activeKinds={activeKinds} 
                />
              ))}
            </div>
          </div>
        )}

        {!isIdentity && currentTab === 'contents' && activeNode.kind === 'PHYSICAL_CONTAINER' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
               <ContainmentBuilder sourceNodeId={activeNode.id} sourceLayer="INSTANCE" allNodes={allNodes as any} activeKinds={activeKinds} />
            </div>
            <div className="space-y-2">
              {containerContents.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">This container is empty.</p> : containerContents.map(item => (
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
                />
              ))}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SHARED TAB CONTENTS (Semantic Connections - Instances Only)               */}
        {/* ========================================================================= */}
        {!isIdentity && currentTab === 'semantic' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-3">
               <RelationBuilder 
                sourceNodeId={activeNode.id} sourceLayer={activeNode.layer as "IDENTITY" | "INSTANCE"} 
                sourceKind={activeNode.kind} allNodes={allNodes as any} allPredicates={allPredicates} activeKinds={activeKinds}
              />
            </div>
            <div className="space-y-2">
              {semanticEdges.length === 0 ? <p className="text-xs text-gray-400 italic p-4 border border-dashed border-gray-200 rounded-lg text-center bg-gray-50">No semantic tags or relationships asserted.</p> : semanticEdges.map(item => (
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