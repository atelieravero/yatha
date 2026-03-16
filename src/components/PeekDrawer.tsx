"use client";

import { useState, useEffect } from "react";
// NOTE: In your local environment, use the real import!
// import { getQuickContext } from "@/app/actions";

// --- Mocks strictly for the web preview environment ---
const getQuickContext = async (nodeId: string) => new Promise<{edges: any[], relatedNodes: any[]}>(resolve => setTimeout(() => resolve({edges: [], relatedNodes: []}), 500));
// ------------------------------------------------------

import { getMediaDetails } from "@/lib/mediaUtils";
import CollapsibleEdgeBlock from "./CollapsibleEdgeBlock";
import { groupEdges } from "@/lib/edgeGrouping";

export default function PeekDrawer({
  peekNode,
  activeNodeId,
  currentTab,
  activeKinds,
  allPredicates = [], 
  securePeekUrl 
}: {
  peekNode: any;
  activeNodeId: string;
  currentTab: string;
  activeKinds: any[];
  allPredicates?: any[];
  securePeekUrl?: string; 
}) {
  const [contextData, setContextData] = useState<{ edges: any[], relatedNodes: any[] }>({ edges: [], relatedNodes: [] });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the full relationship context when the drawer opens
  useEffect(() => {
    if (peekNode) {
      setIsLoading(true);
      // NOTE: Expects getQuickContext to return { edges, relatedNodes }
      getQuickContext(peekNode.id).then((data: any) => {
        setContextData(data);
        setIsLoading(false);
      });
    }
  }, [peekNode]);

  if (!peekNode) return null;

  // --------------------------------------------------------------------------
  // 3-LAYER ICON & LABEL ROUTING 
  // --------------------------------------------------------------------------
  let icon = '🟣';
  let label = 'Concept';

  const peekProps = (peekNode?.properties as Record<string, any>) || {};
  const mediaDetails = getMediaDetails(peekProps);

  if (peekNode.layer === 'PHYSICAL') {
    icon = '📦';
    label = 'Physical Item';
  } else if (peekNode.layer === 'MEDIA') {
    icon = mediaDetails.icon;
    label = mediaDetails.format;
  } else {
    const kindDef = activeKinds.find((k: any) => k.id === peekNode.kind);
    if (kindDef) {
      icon = kindDef.icon;
      label = kindDef.label;
    }
  }

  const closeHref = `/?node=${activeNodeId}${currentTab ? `&tab=${currentTab}` : ''}`;
  const focusHref = `/?node=${peekNode.id}`;

  const { isImage, isVideo, isAudio, isYouTube, isWebLink, ytId } = mediaDetails;
  const propsToDisplay = Object.entries(peekProps).filter(([k]) => k !== 'fileUrl' && k !== 'mimeType' && k !== 'temporal_input' && k !== 'hash');
  const isTombstone = peekNode.isActive === false;

  // --------------------------------------------------------------------------
  // EDGE GROUPING
  // --------------------------------------------------------------------------
  const groups = groupEdges(contextData.edges || [], peekNode, contextData.relatedNodes || []);
  const { physicalHoldings, digitalArtifacts, mediaAppearances, conceptualSemantics, bridgedConcepts, physicalSources, containedIn, containsItems } = groups;

  const isIdentity = peekNode.layer === 'IDENTITY';
  const isPhysical = peekNode.layer === 'PHYSICAL';
  const isMedia = peekNode.layer === 'MEDIA';

  // Base props required by all edge blocks in the drawer.
  // Note: hideEdit is strictly forced to TRUE because drawers are read-only views!
  const edgeContext = {
    currentTab,
    activeNodeId: peekNode.id, // The drawer's node is the active node for these blocks
    activeKinds,
    allPredicates,
    hideEdit: true,
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch bg-gray-900/20 dark:bg-black/60 md:bg-transparent md:dark:bg-transparent backdrop-blur-sm md:backdrop-blur-none pointer-events-none transition-colors duration-300">
      
      {/* Click outside to close (Useful for mobile overlay) */}
      <div className="absolute inset-0 cursor-pointer md:hidden pointer-events-auto" onClick={() => window.location.href = closeHref} />

      {/* Slide-over Panel (Slides up on mobile, left on desktop) */}
      <div className="relative w-full max-w-md h-[85vh] md:h-full bg-white dark:bg-zinc-950 shadow-2xl border-t md:border-t-0 md:border-l border-gray-200 dark:border-zinc-800 flex flex-col animate-in slide-in-from-bottom-full md:slide-in-from-right duration-300 pointer-events-auto rounded-t-2xl md:rounded-none transition-colors">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50 rounded-t-2xl md:rounded-none transition-colors">
          <div className="flex items-center gap-2">
            <span className="text-xl opacity-80">{icon}</span>
            <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest">{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <a href={closeHref} className="text-gray-400 hover:text-gray-900 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors p-1 cursor-pointer">
              ✕
            </a>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* 1. The Core Identity */}
          <div>
            <h2 className={`text-2xl font-serif font-medium text-gray-900 dark:text-zinc-100 mb-1 ${isTombstone ? 'line-through decoration-gray-400 dark:decoration-zinc-500' : ''}`}>
              {peekNode.label}
            </h2>
            {isTombstone && <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-2">(Deleted Record)</span>}
            {peekNode.aliases && peekNode.aliases.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-zinc-400 font-mono mb-2">
                {peekNode.aliases.join(' • ')}
              </p>
            )}
            
            <a 
              href={focusHref} 
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors mt-2 border border-blue-200 dark:border-blue-800/50 px-3 py-1.5 rounded bg-blue-50 dark:bg-blue-900/20 shadow-sm"
            >
              Focus this record ↗
            </a>
          </div>

          {/* 2. Visual Media Payload */}
          {peekNode.layer === 'MEDIA' && (
            <div className="bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden flex items-center justify-center min-h-[200px] shadow-inner transition-colors">
               {isYouTube ? (
                  <iframe className="w-full aspect-video" src={`https://www.youtube.com/embed/${ytId}`} allowFullScreen></iframe>
                ) : isWebLink ? (
                  <a href={mediaDetails.webUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors">Open Web Link ↗</a>
                ) : securePeekUrl ? (
                  isImage ? <img src={securePeekUrl} alt={peekNode.label} className="max-h-[300px] object-contain" />
                  : isVideo ? <video src={securePeekUrl} controls className="max-h-[300px] w-full object-contain bg-black" />
                  : isAudio ? <audio src={securePeekUrl} controls className="w-full max-w-[250px] m-4" />
                  : <a href={securePeekUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium">Download Attached File</a>
                ) : <div className="text-gray-400 dark:text-zinc-500 text-xs font-bold animate-pulse">Loading secure preview...</div>}
            </div>
          )}

          {/* 3. Read-Only Properties Block */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800 pb-1">Properties</h3>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
               {propsToDisplay.length === 0 && !peekProps.temporal_input ? (
                 <span className="italic text-gray-400 dark:text-zinc-500 text-xs">No intrinsic properties defined.</span>
               ) : (
                 <>
                   {peekProps.temporal_input && <span className="font-semibold text-gray-900 dark:text-zinc-100">{peekProps.temporal_input}</span>}
                   {propsToDisplay.map(([key, val]) => {
                     const isSystem = key === 'hash' || key === 'url' || key === 'youtube_id' || key === 'fileSize';
                     return (
                       <span key={key} className={isSystem ? "text-gray-500 dark:text-zinc-400 font-mono text-[10px] break-all bg-gray-50 dark:bg-zinc-800 border border-gray-100 dark:border-zinc-700 px-1.5 py-0.5 rounded" : "text-gray-800 dark:text-zinc-200 font-medium"}>
                         {String(val)}
                       </span>
                     );
                   })}
                 </>
               )}
            </div>
            {peekProps.notes && (
              <div className="text-sm text-gray-600 dark:text-zinc-400 leading-relaxed bg-gray-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-gray-100 dark:border-zinc-800/50 shadow-inner">
                {peekProps.notes}
              </div>
            )}
          </div>

          {/* 4. Structured Context Blocks (Mirrors Main Page) */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest border-b border-gray-100 dark:border-zinc-800 pb-1 mb-3">Graph Context</h3>
            
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-500 animate-pulse py-4">
                <span className="text-lg">⏳</span> Loading relationships...
              </div>
            ) : (!contextData.edges || contextData.edges.length === 0) ? (
              <div className="p-4 border border-dashed border-gray-200 dark:border-zinc-800 rounded-lg text-xs text-gray-400 dark:text-zinc-500 italic text-center">
                No structural or semantic links mapped.
              </div>
            ) : (
              <div className="flex flex-col">
                
                {/* 2a. BRIDGED CONCEPTS */}
                {(isPhysical || isMedia) && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Bridged Concept" icon="💡" items={bridgedConcepts} hideBadge fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} />
                )}

                {/* 2b. PHYSICAL SOURCE MATERIAL */}
                {isMedia && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Physical Source Material" icon="📦" items={physicalSources} hideBadge fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} />
                )}

                {/* 5. PHYSICAL HOLDINGS */}
                {isIdentity && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Physical Holdings" icon="📦" items={physicalHoldings} fixedPredDef={{ forwardLabel: 'CARRIES', reverseLabel: 'CARRIED BY', isSystem: true }} />
                )}

                {/* 6. CONCEPTUAL SEMANTICS */}
                <CollapsibleEdgeBlock {...edgeContext} title={isMedia ? 'Identified Subjects & Semantics' : 'Conceptual Semantics'} icon={isMedia ? '📍' : '🔗'} items={conceptualSemantics} />

                {/* 7. DIGITAL EMBODIMENTS */}
                {(isIdentity || isPhysical) && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Digital Embodiments" icon="🖼️" items={digitalArtifacts} hideBadge />
                )}

                {/* 8. MEDIA APPEARANCES */}
                {(isIdentity || isPhysical) && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Media Appearances" icon="📸" items={mediaAppearances} />
                )}

                {/* 9. COLLECTIONS */}
                <CollapsibleEdgeBlock {...edgeContext} title="Contained In" icon="📥" items={containedIn} fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} />

                {/* 10. CONTENTS */}
                {!isMedia && (
                  <CollapsibleEdgeBlock {...edgeContext} title="Contents & Items" icon="📥" items={containsItems} fixedPredDef={{ forwardLabel: 'CONTAINS', reverseLabel: 'PART OF', isSystem: true }} />
                )}

              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}