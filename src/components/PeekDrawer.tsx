"use client";

import { useState, useEffect } from "react";
import { getQuickContext } from "@/app/actions";
import { getMediaDetails } from "@/lib/mediaUtils";

export default function PeekDrawer({
  peekNode,
  activeNodeId,
  currentTab,
  activeKinds,
  securePeekUrl 
}: {
  peekNode: any;
  activeNodeId: string;
  currentTab: string;
  activeKinds: any[];
  securePeekUrl?: string; 
}) {
  const [contextLinks, setContextLinks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch the lightweight relationship context when the drawer opens
  useEffect(() => {
    if (peekNode) {
      setIsLoading(true);
      getQuickContext(peekNode.id).then(data => {
        setContextLinks(data);
        setIsLoading(false);
      });
    }
  }, [peekNode]);

  if (!peekNode) return null;

  // --------------------------------------------------------------------------
  // 3-LAYER ICON & LABEL ROUTING (Now using shared utility!)
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
    const kindDef = activeKinds.find(k => k.id === peekNode.kind);
    if (kindDef) {
      icon = kindDef.icon;
      label = kindDef.label;
    }
  }
  
  const closeHref = `/?node=${activeNodeId}&tab=${currentTab}`;
  const focusHref = `/?node=${peekNode.id}`;
  
  // Cleanly resolved booleans from our utility
  const { isImage, isVideo, isAudio, isYouTube, isWebLink, ytId } = mediaDetails;
  
  const propsToDisplay = Object.entries(peekProps).filter(([k]) => k !== 'fileUrl' && k !== 'mimeType' && k !== 'temporal_input' && k !== 'hash');

  return (
    // The container is transparent to keep the user anchored to their main workspace.
    <div className="fixed inset-0 z-50 flex justify-end bg-transparent pointer-events-none">
      
      {/* Slide-over Panel */}
      <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right duration-300 pointer-events-auto">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest bg-gray-200 text-gray-700">
              <span className="text-xs">{icon}</span> {label}
            </span>
          </div>
          <div className="flex gap-2 items-center">
            <a href={focusHref} className="text-[10px] font-bold uppercase tracking-widest bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors shadow-sm">
              Focus Node ↗
            </a>
            <a href={closeHref} className="text-gray-400 hover:text-gray-800 p-2 ml-1 text-lg leading-none cursor-pointer" title="Close drawer">
              ✕
            </a>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-8">
          
          {/* 1. Identity / Title Block */}
          <div>
            <h2 className="text-3xl font-serif font-medium text-gray-900 leading-tight">{peekNode.label}</h2>
            {peekNode.aliases && peekNode.aliases.length > 0 && (
              <p className="text-sm text-gray-500 font-mono mt-1">{peekNode.aliases.join(' • ')}</p>
            )}
          </div>

          {/* 2. Media Preview */}
          {(securePeekUrl || isYouTube || isWebLink) && (
            <div className="rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200 min-h-[160px]">
              {isYouTube ? (
                <iframe 
                  className="w-full aspect-video" 
                  src={`https://www.youtube.com/embed/${ytId}`} 
                  title="YouTube video player" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                  allowFullScreen
                ></iframe>
              ) : isWebLink ? (
                <div className="p-6 text-center flex flex-col items-center gap-3">
                  <span className="text-4xl block mb-1">🔗</span>
                  <a href={securePeekUrl} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors shadow-sm text-xs">
                    Open Web Link ↗
                  </a>
                  <span className="text-[10px] text-gray-500 font-mono break-all max-w-full bg-white border border-gray-200 p-1.5 rounded">{securePeekUrl}</span>
                </div>
              ) : isImage ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={securePeekUrl} alt={peekNode.label} className="max-h-64 object-contain w-full" />
              ) : isVideo ? (
                <video src={securePeekUrl} controls className="w-full max-h-64 object-contain bg-black" />
              ) : isAudio ? (
                <div className="p-6 w-full flex flex-col items-center justify-center gap-3">
                  <span className="text-4xl mb-1">🎵</span>
                  <audio src={securePeekUrl} controls className="w-full" />
                </div>
              ) : (
                <div className="p-6 text-center">
                  <span className="text-3xl block mb-2">📄</span>
                  <a href={securePeekUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm font-medium">
                    View Secure File
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 3. Quick Properties Block */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Quick Facts</h3>
            <div className="space-y-3">
              {peekNode.temporalInput && (
                <div>
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-0.5">Temporal Bounds</span>
                  <span className="text-sm text-gray-900 font-medium">{peekNode.temporalInput}</span>
                </div>
              )}
              {propsToDisplay.map(([key, val]) => (
                <div key={key}>
                  <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px] block mb-0.5">{key.replace('_', ' ')}</span>
                  <span className="text-sm text-gray-900 break-words whitespace-pre-wrap">{String(val)}</span>
                </div>
              ))}
              {propsToDisplay.length === 0 && !peekNode.temporalInput && (
                <span className="text-xs text-gray-400 italic">No intrinsic properties set.</span>
              )}
            </div>
          </div>

          {/* 4. Read-Only Context Block */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">Graph Context</h3>
            
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-gray-400 animate-pulse">
                <span className="text-lg">⏳</span> Loading relationships...
              </div>
            ) : contextLinks.length === 0 ? (
              <span className="text-xs text-gray-400 italic">No structural or semantic links mapped.</span>
            ) : (
              <div className="space-y-2">
                {contextLinks.map((link, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-sm">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap uppercase tracking-wider ${link.isSystem ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-blue-600 bg-blue-50 border-blue-100'}`}>
                      {link.predicate}
                    </span>
                    <span className="text-gray-700 truncate">{link.label}</span>
                  </div>
                ))}
                <div className="pt-2 text-xs text-gray-400 italic mt-2">
                  Focus this node to view full relationship details.
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}