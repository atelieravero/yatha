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

export default function MediaReferenceBuilder({
  sourceNodeId,
  sourceLayer,
  sourceKind,
  allNodes,
  activeKinds = [] 
}: {
  sourceNodeId: string;
  sourceLayer: "IDENTITY" | "INSTANCE";
  sourceKind?: string;
  allNodes: MinimalNode[];
  activeKinds?: Kind[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [targetSearch, setTargetSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isMintingInline, setIsMintingInline] = useState(false);
  const [inlineKind, setInlineKind] = useState("");
  const [locator, setLocator] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setTargetSearch("");
      setTargetId("");
      setIsMintingInline(false);
      setLocator("");
    }
  }, [isOpen, sourceNodeId]);

  // --------------------------------------------------------------------------
  // STRICT CONSTRAINT LOGIC: Subject vs Media
  // --------------------------------------------------------------------------
  const isSubjectMode = sourceLayer === 'IDENTITY' || sourceKind === 'PHYSICAL_OBJECT';

  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNodeId) return false;
    
    if (isSubjectMode) {
      // If we are a Subject, we can only be referenced by Non-Physical Media
      return n.layer === 'INSTANCE' && n.kind !== 'PHYSICAL_OBJECT' && n.kind !== 'PHYSICAL_CONTAINER';
    } else {
      // If we are Media, we can only reference Identities or Physical Objects
      return n.layer === 'IDENTITY' || n.kind === 'PHYSICAL_OBJECT';
    }
  });

  const filteredTargets = targetSearch.trim() === "" 
    ? allowedTargets.slice(0, 10) 
    : allowedTargets.filter(n => 
        n.label.toLowerCase().includes(targetSearch.toLowerCase()) ||
        (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(targetSearch.toLowerCase())))
      ).slice(0, 10);

  const getIcon = (n: MinimalNode) => {
    if (n.layer === 'INSTANCE') return FORMAT_ICONS[n.kind || 'PHYSICAL_OBJECT'] || '📦';
    return activeKinds.find(k => k.id === n.kind)?.icon || '🟣';
  };

  const handleAssert = () => {
    startTransition(async () => {
      let finalTargetId = targetId;

      if (isMintingInline && targetSearch.trim() && inlineKind) {
        finalTargetId = await createNode(targetSearch.trim(), "IDENTITY", inlineKind);
      }

      if (!finalTargetId) return;

      // The Graph Rule: [Media] -> REFERENCES -> [Subject]
      let finalSource = sourceNodeId;
      let finalTarget = finalTargetId;

      if (isSubjectMode) {
        // We are the Subject, so the target we selected is the Media
        finalSource = finalTargetId; 
        finalTarget = sourceNodeId;  
      }

      const edgeProperties = locator.trim() ? { locator: locator.trim() } : {};

      await assertEdge(
        finalSource,
        finalTarget,
        SYSTEM_PREDICATES.REFERENCES,
        "SEMANTIC", 
        null, 
        null, 
        999, 
        edgeProperties
      );

      setIsOpen(false);
    });
  };

  const buttonLabel = !isSubjectMode ? "Tag Subject" : "Add Media Appearance";
  const modalTitle = !isSubjectMode ? "Tag Subject in Media" : "Log Media Appearance";
  const searchPlaceholder = !isSubjectMode ? "Search for concept, person, or physical object..." : "Search for photo, video, or document...";
  const emptyStateMsg = !isSubjectMode ? "No valid subjects found." : "No media artifacts found.";

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)} 
        className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
      >
        <span className="text-sm leading-none">+</span> {buttonLabel}
      </button>
    );
  }

  return (
    <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-6 text-left">
      
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>📍</span> {modalTitle}</span>
        <button onClick={() => setIsOpen(false)} disabled={isPending} className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">✕</button>
      </div>

      <div className="space-y-4">
        {!isMintingInline && !targetId ? (
          <div className="relative">
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Record</label>
            <input 
              type="text" 
              placeholder={searchPlaceholder}
              value={targetSearch}
              onChange={(e) => { setTargetSearch(e.target.value); setTargetId(""); }}
              autoFocus
              className="w-full p-2 border border-gray-200 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            />
            
            {targetSearch.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {filteredTargets.length === 0 ? (
                  <div className="p-3 text-xs text-gray-400 italic text-center">{emptyStateMsg}</div>
                ) : (
                  filteredTargets.map(n => (
                    <div 
                      key={n.id} 
                      onClick={() => { setTargetId(n.id); setTargetSearch(n.label); }}
                      className={`p-2 text-sm flex items-center gap-2 cursor-pointer border-b border-gray-50 last:border-0 ${targetId === n.id ? 'bg-emerald-50 text-emerald-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
                    >
                      <span className="opacity-80 shrink-0">{getIcon(n)}</span>
                      <span className="truncate block">
                        {n.label}
                        {n.aliases && n.aliases.length > 0 && (
                          <span className="text-gray-400 font-normal ml-1.5 text-[10px]">({n.aliases.join(', ')})</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
                
                {/* Only allow inline identity minting if we are searching for a Subject */}
                {!isSubjectMode && (
                  <div 
                    onClick={() => setIsMintingInline(true)}
                    className="p-2 text-sm text-emerald-600 font-bold bg-emerald-50/50 hover:bg-emerald-100 cursor-pointer border-t border-emerald-100 flex items-center gap-2"
                  >
                    <span>✨</span> + Create "{targetSearch}" as new Identity...
                  </div>
                )}
              </div>
            )}
          </div>
        ) : isMintingInline ? (
          <div className="p-3 bg-white border border-emerald-300 rounded-md shadow-inner flex items-center gap-3 animate-in slide-in-from-top-1">
            <span className="text-sm font-medium text-gray-900">Minting: "{targetSearch}"</span>
            <select 
              value={inlineKind} 
              onChange={e => setInlineKind(e.target.value)}
              className="flex-1 p-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select Classification...</option>
              {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
            </select>
            <button onClick={() => setIsMintingInline(false)} className="text-xs text-gray-400 hover:text-gray-800 cursor-pointer">✕ Cancel</button>
          </div>
        ) : (
          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-md flex items-center justify-between animate-in slide-in-from-top-1">
            <span className="text-sm font-medium text-emerald-900 flex items-center gap-2">
              <span className="opacity-80 text-xs shrink-0">{getIcon(allNodes.find(n => n.id === targetId)!)}</span>
              {targetSearch}
            </span>
            <button onClick={() => { setTargetId(""); setTargetSearch(""); }} className="text-xs text-emerald-600 hover:text-emerald-800 cursor-pointer font-bold">Change</button>
          </div>
        )}

        {(targetId || isMintingInline) && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md animate-in fade-in slide-in-from-top-1">
             <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Locator / Position (Optional)</label>
             <input
               type="text"
               placeholder="e.g. Page 42, 01:24-01:45, Top-left corner"
               value={locator}
               onChange={(e) => setLocator(e.target.value)}
               disabled={isPending}
               className="p-2 text-xs border border-gray-200 rounded bg-white w-full focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
             />
             <p className="text-[10px] text-gray-400 mt-1.5 font-medium">Specify exactly where this subject appears within the media.</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
        <button onClick={() => setIsOpen(false)} disabled={isPending} className="px-4 py-2 text-gray-500 text-xs font-medium hover:text-gray-800 cursor-pointer">
          Cancel
        </button>
        <button
          onClick={handleAssert}
          disabled={(!targetId && (!isMintingInline || !inlineKind)) || isPending}
          className="px-5 py-2 bg-gray-900 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
        >
          {isPending ? "Saving..." : "Save Reference"}
        </button>
      </div>

    </div>
  );
}