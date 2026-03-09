"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge, createNode } from "@/app/actions";
import { SYSTEM_PREDICATES } from "@/db/schema";

type MinimalNode = { id: string; label: string; layer: "IDENTITY" | "INSTANCE"; kind?: string; aliases?: string[] };

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

export default function ContainmentBuilder({
  sourceNodeId,
  sourceLayer,
  sourceKind,
  allNodes,
  activeKinds = [],
  label = "Add Item",
  direction = "CONTAINS" // NEW: Allow building "Contained In" backwards
}: {
  sourceNodeId: string;
  sourceLayer: "IDENTITY" | "INSTANCE";
  sourceKind?: string;
  allNodes: MinimalNode[];
  activeKinds?: { id: string; label: string; icon: string }[];
  label?: string;
  direction?: "CONTAINS" | "CONTAINED_IN";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isPending, startTransition] = useTransition();

  // Track 1 Explicit Minting State
  const [isMintingInline, setIsMintingInline] = useState(false);
  const [inlineLayer, setInlineLayer] = useState(""); 
  const [inlineKind, setInlineKind] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setTargetId("");
      setIsMintingInline(false);
      setInlineLayer("");
      setInlineKind("");
    }
  }, [isOpen]);

  // --------------------------------------------------------------------------
  // THE STRICT EDGE MATRIX FILTER (CONTAINS)
  // --------------------------------------------------------------------------
  const isSourceIdentity = sourceLayer === 'IDENTITY';
  const isSourcePhysical = sourceLayer === 'INSTANCE' && (sourceKind === 'PHYSICAL_OBJECT' || sourceKind === 'PHYSICAL_CONTAINER');
  const isSourceMedia = sourceLayer === 'INSTANCE' && !isSourcePhysical;

  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNodeId) return false;
    
    const isTargetIdentity = n.layer === 'IDENTITY';
    const isTargetPhysical = n.layer === 'INSTANCE' && (n.kind === 'PHYSICAL_OBJECT' || n.kind === 'PHYSICAL_CONTAINER');
    
    if (direction === 'CONTAINS') {
        if (isSourceIdentity) {
        // 1. Identity can contain anything (Identities, Physical Items, or Digital Media)
        return true;
        } else if (isSourcePhysical) {
        // 2. Physical Containers can ONLY contain other Physical Items
        return isTargetPhysical;
        } else if (isSourceMedia) {
        // 3. Media cannot contain anything
        return false;
        }
    } else {
        // We are adding "Contained In" (The target is the container)
        if (isSourceIdentity) {
            // Identity can only be contained in another Identity
            return isTargetIdentity;
        } else if (isSourcePhysical) {
            // Physical item can be contained in Identity (Collection) or Physical (Box)
            return isTargetIdentity || isTargetPhysical;
        } else if (isSourceMedia) {
             // Media can only be contained in Identity
             return isTargetIdentity;
        }
    }
    
    return false;
  });

  const filteredTargets = searchTerm.trim() === "" 
    ? allowedTargets.slice(0, 10) 
    : allowedTargets.filter(n => 
        n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0, 20);

  const getIcon = (n: MinimalNode) => {
    if (n.layer === 'INSTANCE') return FORMAT_ICONS[n.kind || 'PHYSICAL_OBJECT'] || '📦';
    const k = activeKinds.find(k => k.id === n.kind);
    return k ? k.icon : '🟣';
  };

  const getSubtext = (n: MinimalNode) => {
    if (n.layer === 'INSTANCE') return n.kind ? n.kind.replace('_', ' ') : 'INSTANCE';
    const k = activeKinds.find(k => k.id === n.kind);
    return k ? k.label : 'CONCEPT';
  };

  const handleAssert = () => {
    startTransition(async () => {
      let finalTargetId = targetId;

      // Handle Track 1 Explicit Minting
      if (isMintingInline && searchTerm.trim() && inlineLayer && inlineKind) {
          finalTargetId = await createNode(searchTerm.trim(), inlineLayer as any, inlineKind);
      }

      if (!finalTargetId) return;

      let finalSource = sourceNodeId;
      let finalTarget = finalTargetId;

      if (direction === "CONTAINED_IN") {
          finalSource = finalTargetId;
          finalTarget = sourceNodeId;
      }

      await assertEdge(
        finalSource,
        finalTarget,
        SYSTEM_PREDICATES.CONTAINS,
        "STRUCTURAL"
      );
      setIsOpen(false);
    });
  };

  const mintLabel = direction === 'CONTAINS' ? "Mint Item" : "Mint Location";
  const linkLabel = direction === 'CONTAINS' ? "Link Item" : "Link Location";

  if (!isOpen) {
    return (
      <div className="flex gap-2">
         <button 
          onClick={() => { setIsOpen(true); setIsMintingInline(true); }}
          className="text-[10px] font-bold uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
        >
          ✨ {mintLabel}
        </button>
        <button 
          onClick={() => { setIsOpen(true); setIsMintingInline(false); }}
          className="text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
        >
          🔗 {linkLabel}
        </button>
      </div>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-4">
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>📥</span> {isMintingInline ? mintLabel : (direction === 'CONTAINS' ? 'Link Item Inside' : 'Link to Collection/Location')}</span>
        <button 
          onClick={() => setIsOpen(false)} 
          disabled={isPending} 
          className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
          
        {isMintingInline ? (
            <div className="p-4 bg-white border border-blue-300 rounded-md shadow-inner flex flex-col gap-3 animate-in slide-in-from-top-1">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name of New Record</label>
                  <input 
                      autoFocus
                      type="text"
                      placeholder="e.g. Archive Box 5, The MoMA Collection..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Classification</label>
                  <select 
                      value={`${inlineLayer}|${inlineKind}`} 
                      onChange={e => {
                          const [layer, kind] = e.target.value.split('|');
                          setInlineLayer(layer);
                          setInlineKind(kind);
                      }}
                      className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white"
                  >
                      <option value="|">Select Classification...</option>
                      
                      {/* Identity targets allowed for CONTAINS (Identity) and CONTAINED_IN (All) */}
                      {((direction === 'CONTAINS' && isSourceIdentity) || direction === 'CONTAINED_IN') && (
                          <optgroup label="Identities (Concepts)">
                              {activeKinds.map(k => <option key={k.id} value={`IDENTITY|${k.id}`}>{k.icon} {k.label}</option>)}
                          </optgroup>
                      )}
                      
                      {/* Physical targets allowed for CONTAINS (Identity/Physical) and CONTAINED_IN (Physical) */}
                      {((direction === 'CONTAINS' && (isSourceIdentity || isSourcePhysical)) || (direction === 'CONTAINED_IN' && isSourcePhysical)) && (
                          <optgroup label="Physical Items">
                              <option value="INSTANCE|PHYSICAL_OBJECT">📦 Physical Object</option>
                              <option value="INSTANCE|PHYSICAL_CONTAINER">🗃️ Physical Container</option>
                          </optgroup>
                      )}
                  </select>
                  {direction === 'CONTAINS' && isSourceIdentity && (
                      <p className="text-[10px] text-gray-400 mt-2 font-medium">Note: To add Digital Media, use the Upload (Track 2) button in the Sidebar and link it to this collection.</p>
                  )}
                </div>
            </div>
        ) : !targetId ? (
            <>
                <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search for Item</label>
                <input 
                    type="text" 
                    placeholder={isSourcePhysical ? "Search for physical items..." : "Search for any item..."}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    disabled={isPending}
                    autoFocus
                    className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
                />
                </div>

                {searchTerm.length > 0 && (
                    <div>
                        <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-inner">
                            {filteredTargets.length === 0 ? (
                            <div className="p-3 text-xs text-gray-400 italic text-center">No valid items found.</div>
                            ) : (
                            <div className="flex flex-col">
                                {filteredTargets.map(n => (
                                <button
                                    key={n.id}
                                    onClick={() => setTargetId(n.id)}
                                    disabled={isPending}
                                    className={`flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors border-b border-gray-50 last:border-0 cursor-pointer ${targetId === n.id ? 'bg-blue-100 text-blue-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                                >
                                    <span className="opacity-80 text-lg leading-none">{getIcon(n)}</span>
                                    <div className="flex flex-col min-w-0 flex-1">
                                    <span className="truncate">
                                        {n.label}
                                        {n.aliases && n.aliases.length > 0 && (
                                        <span className="text-gray-400 font-normal ml-1.5 text-xs truncate">({n.aliases.join(', ')})</span>
                                        )}
                                    </span>
                                    <span className="text-[9px] text-gray-400 font-mono tracking-tighter uppercase truncate">{getSubtext(n)}</span>
                                    </div>
                                </button>
                                ))}
                            </div>
                            )}
                        </div>
                    </div>
                )}
            </>
        ) : (
           <div className="p-2 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between animate-in slide-in-from-top-1">
             <span className="text-sm font-medium text-blue-900 flex items-center gap-2">
               <span className="opacity-80 text-xs shrink-0">{getIcon(allNodes.find(n => n.id === targetId)!)}</span>
               {searchTerm}
             </span>
             <button onClick={() => { setTargetId(""); setSearchTerm(""); }} className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer font-bold">Change</button>
           </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
        <button 
          onClick={() => setIsOpen(false)}
          disabled={isPending}
          className="px-4 py-2 text-gray-500 hover:text-gray-800 transition-colors text-xs font-medium cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleAssert}
          disabled={isPending || (!targetId && (!isMintingInline || !inlineLayer || !inlineKind || !searchTerm.trim()))}
          className="px-5 py-2 bg-gray-900 text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50 shadow-sm transition-colors cursor-pointer text-xs"
        >
          {isPending ? "Processing..." : isMintingInline ? "Mint & Save" : "Save Link"}
        </button>
      </div>
    </div>
  );
}