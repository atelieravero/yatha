"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge } from "@/app/actions";
import { SYSTEM_PREDICATES } from "@/db/schema";

type MinimalNode = { id: string; label: string; layer: "IDENTITY" | "INSTANCE"; kind?: string; aliases?: string[] };

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

export default function ContainmentBuilder({
  sourceNodeId,
  sourceLayer,
  allNodes,
  activeKinds = [],
  label = "Add Item"
}: {
  sourceNodeId: string;
  sourceLayer: "IDENTITY" | "INSTANCE";
  allNodes: MinimalNode[];
  activeKinds?: { id: string; label: string; icon: string }[];
  label?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setTargetId("");
    }
  }, [isOpen]);

  // Determine allowed targets based on the source's layer
  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNodeId) return false;
    
    if (sourceLayer === 'INSTANCE') {
      // Physical Containers can only contain other Instances
      return n.layer === 'INSTANCE';
    } else {
      // Conceptual Collections can contain both Instances and other Identities
      return true;
    }
  });

  const filteredTargets = searchTerm.trim() === "" 
    ? allowedTargets.slice(0, 10) // Show top 10 initially
    : allowedTargets.filter(n => 
        n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0, 20);

  const getIcon = (n: MinimalNode) => {
    if (n.layer === 'INSTANCE') return FORMAT_ICONS[n.kind || 'PHYSICAL_OBJECT'] || '📦';
    const k = activeKinds.find(k => k.id === n.kind);
    return k ? k.icon : '🟣';
  };

  const handleAssert = () => {
    if (!targetId) return;

    startTransition(async () => {
      await assertEdge(
        sourceNodeId,
        targetId,
        SYSTEM_PREDICATES.CONTAINS,
        "STRUCTURAL"
      );
      setIsOpen(false);
      setSearchTerm("");
      setTargetId("");
    });
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border border-gray-200 flex items-center gap-1.5"
      >
        <span>+ {label}</span>
      </button>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-4">
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>📥</span> Put Item Inside</span>
        <button 
          onClick={() => setIsOpen(false)} 
          disabled={isPending} 
          className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div>
           <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Search for Item</label>
           <input 
             type="text" 
             placeholder="Type to filter by name or alias..." 
             value={searchTerm}
             onChange={e => setSearchTerm(e.target.value)}
             disabled={isPending}
             autoFocus
             className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 shadow-sm"
           />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Item</label>
          <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-inner">
            {filteredTargets.length === 0 ? (
              <div className="p-3 text-xs text-gray-400 italic text-center">No matching items found.</div>
            ) : (
              <div className="flex flex-col">
                {filteredTargets.map(n => (
                  <button
                    key={n.id}
                    onClick={() => setTargetId(n.id)}
                    disabled={isPending}
                    className={`flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors border-b border-gray-50 last:border-0 cursor-pointer ${targetId === n.id ? 'bg-blue-100 text-blue-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                  >
                    <span className="opacity-80">{getIcon(n)}</span>
                    <span className="truncate">
                      {n.label}
                      {/* Point 7: Expose aliases to prove search hit */}
                      {n.aliases && n.aliases.length > 0 && (
                        <span className="text-gray-400 font-normal ml-1.5 text-xs truncate">({n.aliases.join(', ')})</span>
                      )}
                    </span>
                    <span className="ml-auto text-[10px] text-gray-400 font-mono tracking-tighter uppercase">{n.layer[0]}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
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
          disabled={isPending || !targetId}
          className="px-5 py-2 bg-gray-900 text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50 shadow-sm transition-colors cursor-pointer text-xs"
        >
          {isPending ? "Adding..." : "Add to Contents"}
        </button>
      </div>
    </div>
  );
}