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
  const [locator, setLocator] = useState("");
  const [liveBounds, setLiveBounds] = useState<{start?: Date, end?: Date}>({});

  // --------------------------------------------------------------------------
  // 3-LAYER ONTOLOGY CLASSIFICATION
  // --------------------------------------------------------------------------
  const isSourceIdentity = sourceLayer === 'IDENTITY';
  const isSourcePhysical = sourceLayer === 'INSTANCE' && (sourceKind === 'PHYSICAL_OBJECT' || sourceKind === 'PHYSICAL_CONTAINER');
  const isSourceMedia = sourceLayer === 'INSTANCE' && !isSourcePhysical;

  // SMART DEFAULTS: Auto-select verb to reduce click fatigue for Media Tagging
  useEffect(() => {
    if (isOpen && !selectedConnection && isSourceMedia) {
      let defaultVerb = "";
      if (sourceKind === 'IMAGE' || sourceKind === 'VIDEO' || sourceKind === 'YOUTUBE_VIDEO') defaultVerb = 'depicts';
      else if (sourceKind === 'AUDIO' || sourceKind === 'DOCUMENT' || sourceKind === 'WEB_LINK') defaultVerb = 'mentions';

      if (defaultVerb) {
        const pred = allPredicates.find(p => p.forwardLabel.toLowerCase() === defaultVerb && !p.isSystem);
        if (pred) {
          setSelectedConnection(`${pred.id}_FORWARD`);
        }
      }
    }
  }, [isOpen, sourceKind, allPredicates, selectedConnection, isSourceMedia]);

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
    setLocator("");
    setIsOpen(false);
    setIsCreatingPredicate(false);
    setIsMintingInline(false);
    setLiveBounds({});
  }, [sourceNodeId]);

  const selectedPredId = selectedConnection.split('_')[0];
  const selectedDirection = selectedConnection.split('_')[1];

  // --------------------------------------------------------------------------
  // THE STRICT EDGE MATRIX FILTER
  // --------------------------------------------------------------------------
  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNodeId) return false;
    
    const isTargetPhysical = n.layer === 'INSTANCE' && (n.kind === 'PHYSICAL_OBJECT' || n.kind === 'PHYSICAL_CONTAINER');
    const isTargetMedia = n.layer === 'INSTANCE' && !isTargetPhysical;

    // RULE: Pure semantic links are banned between peers of the same Instance layer to prevent graph hairballs.
    if (isSourcePhysical && isTargetPhysical) return false; // Use CONTAINS or DERIVED_FROM instead
    if (isSourceMedia && isTargetMedia) return false;       // Use CONTAINS or DERIVED_FROM instead
    
    return true;
  });

  const filteredTargets = targetSearch.trim() === "" 
    ? [] 
    : allowedTargets.filter(n => 
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
      const edgeProperties = locator.trim() ? { locator: locator.trim() } : {};

      // 1. Handle Inline Identity Minting (Track 1 integration)
      if (isMintingInline) {
        await createAndLinkIdentity(
          targetSearch.trim(), 
          inlineKind, 
          sourceNodeId, 
          selectedPredId, 
          selectedDirection === "REVERSE"
        );
        // Note: Edge properties like locators are intentionally dropped during quick inline minting to keep the action fast.
        // Users can edit the edge immediately after creation to append exact locators.
      } 
      // 2. Handle Standard Edge Assertion
      else if (targetId) {
        let finalSource = sourceNodeId;
        let finalTarget = targetId;
        if (selectedDirection === "REVERSE") { finalSource = targetId; finalTarget = sourceNodeId; }

        await assertEdge(
          finalSource, finalTarget, selectedPredId, "SEMANTIC", 
          temporalInput || null, null, 999, edgeProperties 
        );
      }

      setIsOpen(false);
      setTargetSearch("");
      setTargetId("");
      setIsMintingInline(false);
      setSelectedConnection("");
      setTemporalInput("");
      setLocator("");
    });
  };

  // Contextual UI Text
  const buttonLabel = isSourceMedia ? "Tag Subject" : "Assert Semantic Link";
  const modalTitle = isSourceMedia ? "📍 Tag Subject & Semantics" : "🔗 Assert Semantic Link";
  const buttonColor = isSourceMedia ? "text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100" : "text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100";
  const modalTheme = isSourceMedia ? "border-emerald-200 bg-emerald-50/30" : "border-blue-200 bg-blue-50/30";

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)} className={`mt-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm ${buttonColor}`}>
        + {buttonLabel}
      </button>
    );
  }

  return (
    <div className={`mt-2 p-4 border rounded-lg shadow-sm animate-in fade-in slide-in-from-top-2 ${modalTheme}`}>
      
      {/* PREDICATE CREATION FLOW */}
      {isCreatingPredicate ? (
        <div className="flex flex-col gap-3 text-sm animate-in fade-in">
          <div className="font-medium text-gray-700 mb-1 flex justify-between items-center border-b border-gray-200 pb-2">
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
          <div className="flex items-center justify-between w-full sm:w-auto">
            <span className="font-bold text-gray-900 whitespace-nowrap flex items-center gap-2">
              {modalTitle.split(' ')[0]} {isSourceMedia ? 'This media' : 'This node'}
            </span>
            <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 px-2 cursor-pointer sm:hidden">✕</button>
          </div>
          
          <select
            value={selectedConnection}
            onChange={(e) => {
              if (e.target.value === "CREATE_NEW") setIsCreatingPredicate(true);
              else { setSelectedConnection(e.target.value); setIsCreatingPredicate(false); }
            }}
            disabled={isPending}
            className="p-2 border border-gray-200 text-gray-900 rounded-md bg-white focus:outline-none focus:ring-2 w-full sm:w-auto font-medium focus:ring-blue-500 shadow-sm"
          >
            <option value="">Select connection verb...</option>
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
        <div className="mb-3 pl-0 sm:pl-[120px] animate-in fade-in relative">
           
           {/* TARGET SELECTOR */}
           {!isMintingInline && !targetId ? (
             <div className="relative mb-3">
                <input 
                  type="text" 
                  placeholder="Type to search for target node..." 
                  value={targetSearch}
                  onChange={(e) => { setTargetSearch(e.target.value); setTargetId(""); }}
                  autoFocus
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
                      <span>✨</span> + Create "{targetSearch}" as new Concept/Identity...
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

           {/* PROPERTIES (Temporal & Locator) */}
           {(targetId || isMintingInline) && (
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-gray-50 border border-gray-200 rounded-md animate-in fade-in slide-in-from-top-1">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Locator / Position (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Top-left, Page 42, 01:24"
                    value={locator}
                    onChange={(e) => setLocator(e.target.value)}
                    disabled={isPending}
                    className="p-1.5 text-xs border border-gray-200 rounded bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                  />
                  <p className="text-[10px] text-gray-400 mt-1.5 font-medium leading-tight">Specify where exactly this interaction or subject appears.</p>
                </div>
                
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Temporal Bounds (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 1995~1998"
                    value={temporalInput}
                    onChange={(e) => setTemporalInput(e.target.value)}
                    disabled={isPending}
                    className="p-1.5 text-xs border border-gray-200 rounded bg-white w-full focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
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
             </div>
           )}
        </div>
      )}

      {/* 3. ACTIONS */}
      {!isCreatingPredicate && selectedConnection && (
        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 mt-2">
          <button onClick={() => setIsOpen(false)} disabled={isPending} className="px-4 py-2 text-gray-500 text-xs font-medium hover:text-gray-800 cursor-pointer hidden sm:block">
            Cancel
          </button>
          <button
            onClick={handleAssert}
            disabled={!selectedConnection || (!targetId && (!isMintingInline || !inlineKind)) || isPending}
            className="px-5 py-2 bg-gray-900 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-gray-800 disabled:opacity-50 transition-colors shadow-sm cursor-pointer w-full sm:w-auto"
          >
            {isPending ? "Saving..." : "Assert Link"}
          </button>
        </div>
      )}

    </div>
  );
}