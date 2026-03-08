"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge, createPredicate, createAndLinkIdentity } from "@/app/actions";
import { parseFuzzyTemporal } from "@/lib/dateParser";

type MinimalNode = { id: string; label: string; layer: "IDENTITY" | "INSTANCE"; kind?: string; aliases?: string[] };
type Predicate = { id: string; forwardLabel: string; reverseLabel: string; isSymmetric: boolean; isSystem: boolean; isActive: boolean };
type Kind = { id: string; label: string; icon: string; isActive: boolean };

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦',
  'PHYSICAL_CONTAINER': '🗃️',
  'IMAGE': '🖼️',
  'VIDEO': '🎞️',
  'AUDIO': '🎵',
  'DOCUMENT': '📄',
  'YOUTUBE_VIDEO': '📺',
  'WEB_LINK': '🔗'
};

export default function RelationBuilder({
  sourceNodeId,
  sourceLayer,
  sourceKind,
  allNodes,
  allPredicates,
  activeKinds = [] 
}: {
  sourceNodeId: string;
  sourceLayer: "IDENTITY" | "INSTANCE";
  sourceKind?: string;
  allNodes: MinimalNode[];
  allPredicates: Predicate[];
  activeKinds?: Kind[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [selectedConnection, setSelectedConnection] = useState("");
  
  // Custom Target Search State
  const [targetSearch, setTargetSearch] = useState("");
  const [targetId, setTargetId] = useState("");
  const [isMintingInline, setIsMintingInline] = useState(false);
  const [inlineKind, setInlineKind] = useState("");
  
  // Custom Predicate Builder State
  const [isCreatingPredicate, setIsCreatingPredicate] = useState(false);
  const [newPredForward, setNewPredForward] = useState("");
  const [newPredReverse, setNewPredReverse] = useState("");
  const [isSymmetric, setIsSymmetric] = useState(false);
  
  // Edge Properties
  const [temporalInput, setTemporalInput] = useState("");
  const [liveBounds, setLiveBounds] = useState<{start?: Date, end?: Date}>({});

  // Sync live bounds when the user types a temporal bound
  useEffect(() => {
    if (temporalInput !== undefined) {
      const parsed = parseFuzzyTemporal(temporalInput);
      setLiveBounds({ start: parsed.notEarlierThan, end: parsed.notLaterThan });
    }
  }, [temporalInput]);

  useEffect(() => {
    setSelectedConnection("");
    setTargetId("");
    setTargetSearch("");
    setTemporalInput("");
    setIsOpen(false);
    setIsCreatingPredicate(false);
    setIsMintingInline(false);
    setLiveBounds({});
  }, [sourceNodeId]);

  const selectedPredId = selectedConnection.split('_')[0];
  const selectedDirection = selectedConnection.split('_')[1];

  const availableTargets = allNodes.filter(n => n.id !== sourceNodeId);
  const filteredTargets = targetSearch.trim() === "" 
    ? [] 
    : availableTargets.filter(n => 
        n.label.toLowerCase().includes(targetSearch.toLowerCase()) ||
        (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(targetSearch.toLowerCase())))
      ).slice(0, 10);

  const getIcon = (n: MinimalNode) => {
    if (n.layer === 'INSTANCE') return FORMAT_ICONS[n.kind || 'PHYSICAL_OBJECT'] || '📦';
    return activeKinds.find(k => k.id === n.kind)?.icon || '🟣';
  };

  const handleCreatePredicate = () => {
    if (!newPredForward.trim() || (!isSymmetric && !newPredReverse.trim())) return;
    startTransition(async () => {
      const forward = newPredForward.toLowerCase().trim();
      const reverse = isSymmetric ? forward : newPredReverse.toLowerCase().trim();
      await createPredicate(forward, reverse, isSymmetric);
      setIsCreatingPredicate(false);
      setNewPredForward("");
      setNewPredReverse("");
      setIsSymmetric(false);
    });
  };

  const handleAssert = () => {
    if (!selectedConnection) return;

    startTransition(async () => {
      // 1. Handle Inline Identity Minting
      if (isMintingInline) {
        await createAndLinkIdentity(
          targetSearch.trim(), 
          inlineKind, 
          sourceNodeId, 
          selectedPredId, 
          selectedDirection === "REVERSE"
        );
      } 
      // 2. Handle Standard Edge Assertion
      else if (targetId) {
        let finalSource = sourceNodeId;
        let finalTarget = targetId;
        if (selectedDirection === "REVERSE") { finalSource = targetId; finalTarget = sourceNodeId; }

        await assertEdge(
          finalSource, finalTarget, selectedPredId, "SEMANTIC", 
          temporalInput, null, 999 
        );
      }

      setIsOpen(false);
      setTargetSearch("");
      setTargetId("");
      setIsMintingInline(false);
      setSelectedConnection("");
      setTemporalInput("");
    });
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className="mt-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm">
        <span className="text-sm leading-none">+</span> Assert Semantic Link
      </button>
    );
  }

  return (
    <div className="mt-2 p-4 border border-blue-200 bg-blue-50/50 rounded-lg shadow-sm animate-in fade-in slide-in-from-top-2">
      
      {/* PREDICATE CREATION FLOW */}
      {isCreatingPredicate ? (
        <div className="flex flex-col gap-3 text-sm animate-in fade-in">
          <div className="font-medium text-gray-700 mb-1 flex justify-between items-center border-b border-blue-100 pb-2">
            <span>✨ Define New Semantic Pair</span>
            <button onClick={() => setIsCreatingPredicate(false)} className="text-gray-400 hover:text-gray-600 px-2 cursor-pointer">✕</button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="w-20 text-gray-500 text-xs font-bold text-right uppercase">Forward</span>
            <input 
              type="text" placeholder="e.g. influenced by" 
              value={newPredForward} onChange={e => setNewPredForward(e.target.value)}
              disabled={isPending}
              className="p-1.5 border border-blue-300 rounded text-blue-800 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
            />
          </div>

          <div className="flex gap-2 items-center sm:ml-22 mt-1 mb-1">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer font-medium">
              <input 
                type="checkbox" 
                checked={isSymmetric} 
                onChange={e => setIsSymmetric(e.target.checked)} 
                className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
              />
              Is symmetric (e.g. "married to")
            </label>
          </div>

          {!isSymmetric && (
            <div className="flex gap-2 items-center animate-in fade-in">
              <span className="w-20 text-gray-500 text-xs font-bold text-right uppercase">Reverse</span>
              <input 
                type="text" placeholder="e.g. influence on" 
                value={newPredReverse} onChange={e => setNewPredReverse(e.target.value)}
                disabled={isPending}
                className="p-1.5 border border-blue-300 rounded text-blue-800 w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>
          )}

          <div className="flex gap-2 sm:ml-22 mt-2">
            <button 
              onClick={handleCreatePredicate} 
              disabled={isPending || !newPredForward.trim() || (!isSymmetric && !newPredReverse.trim())}
              className="px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Saving..." : "Save Pair to Dictionary"}
            </button>
            <button 
              onClick={() => setIsCreatingPredicate(false)} 
              disabled={isPending}
              className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-800 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* 1. PREDICATE SELECTOR */
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 text-sm mb-3">
          <span className="font-medium text-gray-700 whitespace-nowrap">This node</span>
          <select
            value={selectedConnection}
            onChange={(e) => {
              if (e.target.value === "CREATE_NEW") setIsCreatingPredicate(true);
              else { setSelectedConnection(e.target.value); setIsCreatingPredicate(false); }
            }}
            disabled={isPending}
            className="p-2 border border-gray-200 text-gray-900 rounded-md bg-white focus:outline-none focus:ring-2 w-full sm:w-auto font-medium focus:ring-blue-500"
          >
            <option value="">Select connection...</option>
            <optgroup label="Semantic Vocabulary">
              {allPredicates
                .filter(p => p.isActive && !p.isSystem)
                .flatMap(p => p.isSymmetric 
                  ? [{ value: `${p.id}_SYMMETRIC`, label: p.forwardLabel }] 
                  : [
                      { value: `${p.id}_FORWARD`, label: p.forwardLabel },
                      { value: `${p.id}_REVERSE`, label: p.reverseLabel }
                    ]
                )
                .sort((a, b) => a.label.localeCompare(b.label))
                .map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))
              }
              <option value="CREATE_NEW" className="font-bold text-blue-600">+ Create new semantic pair...</option>
            </optgroup>
          </select>
        </div>
      )}

      {/* 2. TARGET SELECTOR & PROPERTIES */}
      {!isCreatingPredicate && selectedConnection && (
        <div className="mb-3 pl-0 sm:pl-[70px] animate-in fade-in relative">
           
           {/* TARGET SELECTOR */}
           {!isMintingInline && !targetId ? (
             <div className="relative mb-3">
                <input 
                  type="text" 
                  placeholder="Type to search for target node..." 
                  value={targetSearch}
                  onChange={(e) => { setTargetSearch(e.target.value); setTargetId(""); }}
                  className="w-full p-2 border border-gray-200 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                
                {targetSearch.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                    {filteredTargets.length === 0 ? (
                      <div className="p-3 text-xs text-gray-400 italic text-center">No nodes found matching your search.</div>
                    ) : (
                      filteredTargets.map(n => (
                        <div 
                          key={n.id} 
                          onClick={() => { setTargetId(n.id); setTargetSearch(n.label); }}
                          className={`p-2 text-sm flex items-center gap-2 cursor-pointer border-b border-gray-50 last:border-0 ${targetId === n.id ? 'bg-blue-50 text-blue-900 font-medium' : 'hover:bg-gray-50 text-gray-700'}`}
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
                    
                    {/* INLINE MINT BUTTON */}
                    <div 
                      onClick={() => setIsMintingInline(true)}
                      className="p-2 text-sm text-blue-600 font-bold bg-blue-50/50 hover:bg-blue-100 cursor-pointer border-t border-blue-100 flex items-center gap-2"
                    >
                      <span>✨</span> + Create "{targetSearch}" as new Identity...
                    </div>
                  </div>
                )}
             </div>
           ) : isMintingInline ? (
             <div className="p-3 mb-3 bg-white border border-blue-300 rounded-md shadow-inner flex items-center gap-3 animate-in slide-in-from-top-1">
               <span className="text-sm font-medium text-gray-900">Minting: "{targetSearch}"</span>
               <select 
                 value={inlineKind} 
                 onChange={e => setInlineKind(e.target.value)}
                 className="flex-1 p-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
               >
                 <option value="">Select Kind...</option>
                 {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
               </select>
               <button onClick={() => setIsMintingInline(false)} className="text-xs text-gray-400 hover:text-gray-800 cursor-pointer">✕ Cancel</button>
             </div>
           ) : (
             <div className="p-2 mb-3 bg-blue-50 border border-blue-200 rounded-md flex items-center justify-between animate-in slide-in-from-top-1">
               <span className="text-sm font-medium text-blue-900 flex items-center gap-2">
                 <span className="opacity-80 text-xs shrink-0">{getIcon(allNodes.find(n => n.id === targetId)!)}</span>
                 {targetSearch}
               </span>
               <button onClick={() => { setTargetId(""); setTargetSearch(""); }} className="text-xs text-blue-500 hover:text-blue-700 cursor-pointer">Change</button>
             </div>
           )}

           {/* TEMPORAL BOUNDS (Always visible once connected is picked) */}
           {(targetId || isMintingInline) && (
             <div className="p-3 bg-gray-50 border border-gray-200 rounded-md animate-in fade-in slide-in-from-top-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Temporal Bounds (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 1995~1998"
                  value={temporalInput}
                  onChange={(e) => setTemporalInput(e.target.value)}
                  disabled={isPending}
                  className="p-1.5 text-xs border border-gray-200 rounded bg-white w-full sm:max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                {(temporalInput || liveBounds.start || liveBounds.end) && (
                  <div className="mt-2 bg-emerald-50/50 border border-emerald-100 p-2 rounded-md w-fit">
                    <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block mb-0.5">
                      ↳ System Boundaries:
                    </span>
                    <div className="font-mono text-[10px] text-emerald-900 flex items-center gap-2">
                      <span>{liveBounds.start ? liveBounds.start.toISOString().split('T')[0] : 'Open'}</span>
                      <span className="text-gray-400">→</span>
                      <span>{liveBounds.end ? liveBounds.end.toISOString().split('T')[0] : 'Open'}</span>
                    </div>
                  </div>
                )}
             </div>
           )}
        </div>
      )}

      {/* 3. ACTIONS */}
      {!isCreatingPredicate && selectedConnection && (
        <div className="flex justify-end gap-2 pt-3 border-t border-blue-100">
          <button onClick={() => setIsOpen(false)} disabled={isPending} className="px-4 py-2 text-gray-500 text-xs font-medium hover:text-gray-800 cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleAssert}
            disabled={!selectedConnection || (!targetId && (!isMintingInline || !inlineKind)) || isPending}
            className="px-5 py-2 bg-gray-900 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {isPending ? "Saving..." : "Assert Link"}
          </button>
        </div>
      )}

    </div>
  );
}