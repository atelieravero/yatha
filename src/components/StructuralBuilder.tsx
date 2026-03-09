"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge, createNode } from "@/app/actions";
import { SYSTEM_PREDICATES } from "@/db/schema";

type MinimalNode = { id: string; label: string; layer: "IDENTITY" | "INSTANCE"; kind?: string; aliases?: string[] };
type Kind = { id: string; label: string; icon: string; isActive: boolean };

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

export default function StructuralBuilder({
  sourceNodeId,
  targetType,
  direction = "FORWARD", // NEW: FORWARD = Node carries Target; REVERSE = Target carries Node
  allNodes,
  activeKinds = [] 
}: {
  sourceNodeId: string;
  targetType: 'IDENTITY' | 'PHYSICAL';
  direction?: "FORWARD" | "REVERSE";
  allNodes: MinimalNode[];
  activeKinds?: Kind[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isPending, startTransition] = useTransition();

  // Track 1 Explicit Minting State
  const [isMintingInline, setIsMintingInline] = useState(false);
  const [inlineKind, setInlineKind] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setTargetId("");
      setIsMintingInline(false);
      setInlineKind("");
    }
  }, [isOpen]);

  // Determine allowed targets strictly based on targetType
  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNodeId) return false;
    
    if (targetType === 'IDENTITY') {
      return n.layer === 'IDENTITY';
    } else {
      return n.layer === 'INSTANCE' && (n.kind === 'PHYSICAL_OBJECT' || n.kind === 'PHYSICAL_CONTAINER');
    }
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
      if (isMintingInline && searchTerm.trim() && inlineKind) {
        finalTargetId = await createNode(
          searchTerm.trim(), 
          targetType === 'IDENTITY' ? "IDENTITY" : "INSTANCE", 
          inlineKind
        );
      }

      if (!finalTargetId) return;

      // Apply Matrix Direction
      let edgeSource = sourceNodeId;
      let edgeTarget = finalTargetId;

      if (direction === "REVERSE") {
        // e.g. Identity Page: Target (Physical Object) -> CARRIES -> Node (Identity)
        edgeSource = finalTargetId;
        edgeTarget = sourceNodeId;
      }

      await assertEdge(
        edgeSource,
        edgeTarget,
        SYSTEM_PREDICATES.CARRIES,
        "STRUCTURAL",
        null // Temporal bounds not permitted for CARRIES, and Role is deprecated
      );
      setIsOpen(false);
    });
  };

  const isIdentity = targetType === 'IDENTITY';
  const modalTheme = isIdentity ? "border-blue-200 bg-blue-50/30" : "border-amber-200 bg-amber-50/30";
  const icon = isIdentity ? "💡" : "📦";

  // Dynamic Button Labels
  let mintBtnText = isIdentity ? "Mint Concept" : "Mint Source";
  let linkBtnText = isIdentity ? "Link Concept" : "Link Source";
  
  if (targetType === 'PHYSICAL' && direction === 'REVERSE') {
    mintBtnText = "Mint Holding";
    linkBtnText = "Link Holding";
  }

  if (!isOpen) {
    return (
      <div className="flex gap-2">
        <button 
          onClick={() => { setIsOpen(true); setIsMintingInline(true); }}
          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border flex items-center gap-1.5 ${isIdentity ? 'text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100' : 'text-amber-800 bg-amber-50 border-amber-200 hover:bg-amber-100'}`}
        >
          ✨ {mintBtnText}
        </button>
        <button 
          onClick={() => { setIsOpen(true); setIsMintingInline(false); }}
          className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border flex items-center gap-1.5 bg-white text-gray-600 border-gray-200 hover:bg-gray-50`}
        >
          🔗 {linkBtnText}
        </button>
      </div>
    );
  }

  return (
    <div className={`mt-4 border rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-2 text-left ${modalTheme}`}>
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>{icon}</span> {isMintingInline ? `Mint New ${isIdentity ? 'Concept' : 'Physical Source'}` : `Link Existing ${isIdentity ? 'Concept' : 'Source'}`}</span>
        <button onClick={() => setIsOpen(false)} disabled={isPending} className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">✕</button>
      </div>

      <div className="space-y-4">
        
        {isMintingInline ? (
           <div className={`p-4 bg-white border rounded-md shadow-inner flex flex-col gap-3 animate-in slide-in-from-top-1 ${isIdentity ? 'border-blue-300' : 'border-amber-300'}`}>
             <div>
               <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name of New Record</label>
               <input 
                 autoFocus
                 type="text"
                 placeholder={`e.g. ${isIdentity ? '1980 Hotel Photo' : 'Folder 4, Archive Box'}`}
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
                 className={`w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 ${isIdentity ? 'focus:ring-blue-500' : 'focus:ring-amber-500'} shadow-sm`}
               />
             </div>
             <div>
               <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Classification</label>
               <select 
                 value={inlineKind} 
                 onChange={e => setInlineKind(e.target.value)}
                 className={`w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 ${isIdentity ? 'focus:ring-blue-500' : 'focus:ring-amber-500'} shadow-sm bg-white`}
               >
                 <option value="">Select Kind...</option>
                 {isIdentity ? (
                    activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)
                 ) : (
                   <>
                     <option value="PHYSICAL_OBJECT">📦 Physical Object</option>
                     <option value="PHYSICAL_CONTAINER">🗃️ Physical Container</option>
                   </>
                 )}
               </select>
             </div>
           </div>
        ) : !targetId ? (
            <>
              <div>
                 <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">
                   Search for {isIdentity ? "Concept / Identity" : "Physical Material"}
                 </label>
                 <input 
                   type="text" 
                   placeholder={`Type to search...`}
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                   disabled={isPending}
                   autoFocus
                   className={`w-full p-2 text-xs border rounded outline-none shadow-sm focus:ring-2 ${isIdentity ? 'border-blue-200 focus:ring-blue-500 bg-white text-gray-900' : 'border-amber-200 focus:ring-amber-500 bg-white text-gray-900'}`}
                 />
              </div>

              {searchTerm.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-inner">
                  {filteredTargets.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 italic text-center">No matching records found.</div>
                  ) : (
                    <div className="flex flex-col">
                      {filteredTargets.map(n => (
                        <button
                          key={n.id}
                          onClick={() => setTargetId(n.id)}
                          disabled={isPending}
                          className={`flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors border-b border-gray-50 last:border-0 cursor-pointer ${targetId === n.id ? (isIdentity ? 'bg-blue-100 text-blue-900 font-medium' : 'bg-amber-100 text-amber-900 font-medium') : 'hover:bg-gray-50 text-gray-700'}`}
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
              )}
            </>
        ) : (
           <div className={`p-2 border rounded-md flex items-center justify-between animate-in slide-in-from-top-1 ${isIdentity ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'}`}>
             <span className={`text-sm font-medium flex items-center gap-2 ${isIdentity ? 'text-blue-900' : 'text-amber-900'}`}>
               <span className="opacity-80 text-xs shrink-0">{getIcon(allNodes.find(n => n.id === targetId)!)}</span>
               {searchTerm}
             </span>
             <button onClick={() => { setTargetId(""); setSearchTerm(""); }} className={`text-xs cursor-pointer font-bold ${isIdentity ? 'text-blue-500 hover:text-blue-700' : 'text-amber-600 hover:text-amber-800'}`}>Change</button>
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
          disabled={isPending || (!targetId && (!isMintingInline || !inlineKind || !searchTerm.trim()))}
          className={`px-5 py-2 text-white rounded font-bold hover:bg-gray-800 disabled:opacity-50 shadow-sm transition-colors cursor-pointer text-xs uppercase tracking-widest ${isIdentity ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-600 hover:bg-amber-700'}`}
        >
          {isPending ? "Processing..." : isMintingInline ? "Mint & Save" : "Save Link"}
        </button>
      </div>
    </div>
  );
}