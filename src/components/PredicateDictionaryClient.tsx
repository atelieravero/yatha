"use client";

import { useState, useTransition } from "react";
import { createPredicate, updatePredicate, deactivateAndMigratePredicate } from "@/app/actions";

type Kind = { id: string; label: string; icon: string; isActive: boolean };

type Predicate = {
  id: string;
  forwardLabel: string;
  reverseLabel: string;
  isSymmetric: boolean;
  isSystem: boolean;
  isActive: boolean;
  sourceLayers: string[] | null;
  targetLayers: string[] | null;
  sourceDefaultKind: string | null;
  targetDefaultKind: string | null;
};

export default function PredicateDictionaryClient({ 
  initialPredicates, 
  edgeCounts,
  activeKinds = []
}: { 
  initialPredicates: Predicate[]; 
  edgeCounts: Record<string, number>;
  activeKinds?: Kind[];
}) {
  const [isPending, startTransition] = useTransition();

  // Creation State
  const [newForward, setNewForward] = useState("");
  const [newReverse, setNewReverse] = useState("");
  const [isSymmetric, setIsSymmetric] = useState(false);
  const [newSourceLayers, setNewSourceLayers] = useState<string[]>(['IDENTITY', 'PHYSICAL', 'MEDIA']);
  const [newTargetLayers, setNewTargetLayers] = useState<string[]>(['IDENTITY', 'PHYSICAL', 'MEDIA']);
  const [newSourceKind, setNewSourceKind] = useState("");
  const [newTargetKind, setNewTargetKind] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForward, setEditForward] = useState("");
  const [editReverse, setEditReverse] = useState("");
  const [editSymmetric, setEditSymmetric] = useState(false);
  const [editSourceLayers, setEditSourceLayers] = useState<string[]>([]);
  const [editTargetLayers, setEditTargetLayers] = useState<string[]>([]);
  const [editSourceKind, setEditSourceKind] = useState("");
  const [editTargetKind, setEditTargetKind] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Migration State
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");

  const activePredicates = initialPredicates.filter(p => p.isActive);
  const inactivePredicates = initialPredicates.filter(p => !p.isActive);

  // --- Helpers ---
  const toggleLayer = (current: string[], setFn: (v: string[]) => void, layer: string) => {
    if (current.includes(layer)) setFn(current.filter(l => l !== layer));
    else setFn([...current, layer]);
  };

  const getLayerSummaryText = (layers: string[], kindId: string | null) => {
    if (!layers || layers.length === 0) return "Nothing";
    const parts = [];
    if (layers.includes('IDENTITY')) {
      const k = activeKinds.find(k => k.id === kindId);
      parts.push(k ? `[${k.label}]` : "[Concept]");
    }
    if (layers.includes('PHYSICAL')) parts.push("[Physical Item]");
    if (layers.includes('MEDIA')) parts.push("[Digital Media]");
    
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return `${parts[0]} or ${parts[1]}`;
    return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
  };

  const validatePredicateName = (forward: string, reverse: string, excludeId?: string) => {
    const fNorm = forward.trim().toLowerCase();
    const rNorm = reverse.trim().toLowerCase();
    const collision = initialPredicates.find(p => p.id !== excludeId && (
      p.forwardLabel.toLowerCase() === fNorm || p.reverseLabel.toLowerCase() === fNorm ||
      p.forwardLabel.toLowerCase() === rNorm || p.reverseLabel.toLowerCase() === rNorm
    ));
    return collision ? `Name collision with existing predicate: "${collision.forwardLabel}".` : null;
  };

  // --- Handlers ---
  const handleCreate = () => {
    if (!newForward.trim() || (!isSymmetric && !newReverse.trim())) return;
    if (newSourceLayers.length === 0 || (!isSymmetric && newTargetLayers.length === 0)) {
      setCreateError("You must allow at least one layer for both Source and Target.");
      return;
    }

    const error = validatePredicateName(newForward, isSymmetric ? newForward : newReverse);
    if (error) return setCreateError(error);

    startTransition(async () => {
      const f = newForward.trim().toLowerCase();
      const r = isSymmetric ? f : newReverse.trim().toLowerCase();
      
      const targetL = isSymmetric ? newSourceLayers : newTargetLayers;
      const targetK = isSymmetric ? newSourceKind : newTargetKind;

      await createPredicate(
        f, r, isSymmetric, 
        newSourceLayers, targetL, 
        newSourceKind || null, targetK || null
      );
      
      setNewForward(""); setNewReverse(""); setIsSymmetric(false);
      setNewSourceLayers(['IDENTITY', 'PHYSICAL', 'MEDIA']);
      setNewTargetLayers(['IDENTITY', 'PHYSICAL', 'MEDIA']);
      setNewSourceKind(""); setNewTargetKind("");
      setCreateError(null);
    });
  };

  const handleEditStart = (pred: Predicate) => {
    setEditingId(pred.id);
    setEditForward(pred.forwardLabel);
    setEditReverse(pred.reverseLabel);
    setEditSymmetric(pred.isSymmetric);
    setEditSourceLayers(pred.sourceLayers || ['IDENTITY', 'PHYSICAL', 'MEDIA']);
    setEditTargetLayers(pred.targetLayers || ['IDENTITY', 'PHYSICAL', 'MEDIA']);
    setEditSourceKind(pred.sourceDefaultKind || "");
    setEditTargetKind(pred.targetDefaultKind || "");
    setEditError(null);
    setMigratingId(null); 
  };

  const handleEditSave = (id: string) => {
    if (!editForward.trim() || (!editSymmetric && !editReverse.trim())) return;
    if (editSourceLayers.length === 0 || (!editSymmetric && editTargetLayers.length === 0)) {
      setEditError("You must allow at least one layer for both Source and Target.");
      return;
    }

    const error = validatePredicateName(editForward, editSymmetric ? editForward : editReverse, id);
    if (error) return setEditError(error);

    startTransition(async () => {
      const f = editForward.trim().toLowerCase();
      const r = editSymmetric ? f : editReverse.trim().toLowerCase();
      const targetL = editSymmetric ? editSourceLayers : editTargetLayers;
      const targetK = editSymmetric ? editSourceKind : editTargetKind;

      await updatePredicate(
        id, f, r, editSymmetric,
        editSourceLayers, targetL,
        editSourceKind || null, targetK || null
      );
      
      setEditingId(null);
      setEditError(null);
    });
  };

  const handleMigrate = (oldId: string) => {
    if (!targetId) return;
    startTransition(async () => {
      await deactivateAndMigratePredicate(oldId, targetId);
      setMigratingId(null); setTargetId("");
    });
  };

  const handleDeactivateEmpty = (oldId: string) => {
    startTransition(async () => {
      const dummyTargetId = activePredicates.find(p => p.id !== oldId)?.id || "dummy_id";
      await deactivateAndMigratePredicate(oldId, dummyTargetId);
      setMigratingId(null); setTargetId("");
    });
  };

  // --- Sub-components ---
  const LayerSelector = ({ title, layers, setLayers, kind, setKind, disabled }: any) => (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">{title}</label>
      <div className="flex gap-4 mb-2">
        {['IDENTITY', 'PHYSICAL', 'MEDIA'].map(l => (
          <label key={l} className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
            <input type="checkbox" disabled={disabled} checked={layers.includes(l)} onChange={() => toggleLayer(layers, setLayers, l)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            {l === 'IDENTITY' ? 'Concept' : l === 'PHYSICAL' ? 'Physical' : 'Media'}
          </label>
        ))}
      </div>
      {layers.includes('IDENTITY') && (
        <div className="mt-2 pt-2 border-t border-gray-200 animate-in fade-in">
          <select value={kind} onChange={e => setKind(e.target.value)} disabled={disabled} className="w-full p-1.5 text-xs border border-gray-300 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none">
            <option value="">No Default Classification...</option>
            {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* LEFT COLUMN: Creation Form */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>✨</span> Mint Semantic Pair
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Forward Label</label>
              <input
                type="text" placeholder="e.g. authored by" value={newForward}
                onChange={(e) => { setNewForward(e.target.value); setCreateError(null); }} disabled={isPending}
                className="w-full p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-gray-600 font-medium cursor-pointer py-1">
              <input type="checkbox" checked={isSymmetric} onChange={e => setIsSymmetric(e.target.checked)} className="rounded border-blue-300 text-blue-600 focus:ring-blue-500 w-4 h-4" />
              Is symmetric (e.g. "married to")
            </label>

            {!isSymmetric && (
              <div className="animate-in fade-in slide-in-from-top-1">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Reverse Label</label>
                <input
                  type="text" placeholder="e.g. author of" value={newReverse}
                  onChange={(e) => { setNewReverse(e.target.value); setCreateError(null); }} disabled={isPending}
                  className="w-full p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
              </div>
            )}

            <div className="space-y-3 pt-2">
              <LayerSelector title="Source Requirements" layers={newSourceLayers} setLayers={setNewSourceLayers} kind={newSourceKind} setKind={setNewSourceKind} disabled={isPending} />
              {!isSymmetric && (
                <LayerSelector title="Target Requirements" layers={newTargetLayers} setLayers={setNewTargetLayers} kind={newTargetKind} setKind={setNewTargetKind} disabled={isPending} />
              )}
            </div>

            {/* Plain English Sanity Check */}
            {(newForward || newReverse) && (
              <div className="p-3 bg-white border border-blue-200 rounded-md text-xs text-gray-700 leading-relaxed shadow-inner">
                <span className="font-bold text-blue-800 uppercase tracking-widest text-[10px] block mb-1">Sanity Check:</span>
                This means <strong>{getLayerSummaryText(newSourceLayers, newSourceKind)}</strong> can be <em>"{newForward || '...'}"</em> <strong>{getLayerSummaryText(isSymmetric ? newSourceLayers : newTargetLayers, isSymmetric ? newSourceKind : newTargetKind)}</strong>.
              </div>
            )}
            
            {createError && <p className="text-xs text-red-500 font-medium mt-1">{createError}</p>}

            <button
              onClick={handleCreate} disabled={isPending || !newForward.trim() || (!isSymmetric && !newReverse.trim())}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
            >
              {isPending ? "Minting..." : "Create Pair"}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Active Dictionary */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📖</span> Active Connections
          </h2>
          
          <div className="space-y-3">
            {activePredicates.map(pred => {
              const count = edgeCounts[pred.id] || 0;
              const isMigrating = migratingId === pred.id;
              const isEditing = editingId === pred.id;

              return (
                <div key={pred.id} className={`bg-white border rounded-lg p-4 shadow-sm transition-all hover:shadow-md ${pred.isSystem ? 'border-amber-200 bg-amber-50/10' : 'border-gray-200'}`}>
                  
                  {isEditing ? (
                    <div className="flex flex-col gap-4 animate-in fade-in">
                      <div className="flex flex-col gap-2">
                        <div className="flex gap-2 items-center">
                           <span className="w-16 text-[10px] font-bold text-gray-400 uppercase text-right">Forward</span>
                           <input type="text" value={editForward} onChange={(e) => { setEditForward(e.target.value); setEditError(null); }} className="flex-1 p-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-900" />
                        </div>
                        <div className="flex gap-2 items-center ml-18">
                          <label className="flex items-center gap-2 text-xs text-gray-600 font-medium cursor-pointer">
                            <input type="checkbox" checked={editSymmetric} onChange={e => setEditSymmetric(e.target.checked)} className="rounded border-blue-300" />
                            Is symmetric
                          </label>
                        </div>
                        {!editSymmetric && (
                          <div className="flex gap-2 items-center">
                            <span className="w-16 text-[10px] font-bold text-gray-400 uppercase text-right">Reverse</span>
                            <input type="text" value={editReverse} onChange={(e) => { setEditReverse(e.target.value); setEditError(null); }} className="flex-1 p-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-gray-700" />
                          </div>
                        )}
                      </div>

                      <div className="ml-18 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <LayerSelector title="Source Limits" layers={editSourceLayers} setLayers={setEditSourceLayers} kind={editSourceKind} setKind={setEditSourceKind} disabled={isPending} />
                        {!editSymmetric && (
                          <LayerSelector title="Target Limits" layers={editTargetLayers} setLayers={setEditTargetLayers} kind={editTargetKind} setKind={setEditTargetKind} disabled={isPending} />
                        )}
                      </div>

                      <div className="ml-18 p-3 bg-blue-50/50 border border-blue-100 rounded-md text-xs text-gray-700">
                         <strong>{getLayerSummaryText(editSourceLayers, editSourceKind)}</strong> can be <em>"{editForward || '...'}"</em> <strong>{getLayerSummaryText(editSymmetric ? editSourceLayers : editTargetLayers, editSymmetric ? editSourceKind : editTargetKind)}</strong>.
                      </div>
                      
                      <div className="flex items-center gap-2 ml-18 pt-2 border-t border-gray-100">
                        <button onClick={() => handleEditSave(pred.id)} disabled={isPending} className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
                          {isPending ? "..." : "Save Pair"}
                        </button>
                        <button onClick={() => { setEditingId(null); setEditError(null); }} disabled={isPending} className="px-3 py-1.5 text-gray-500 text-xs font-bold hover:text-gray-800 cursor-pointer">
                          Cancel
                        </button>
                      </div>
                      {editError && <p className="text-xs text-red-500 font-medium ml-18">{editError}</p>}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          {pred.isSystem && (
                             <span className="inline-block px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-widest rounded mb-1.5 border border-amber-200">
                               🔒 System Core
                             </span>
                          )}
                          <div className="flex items-center gap-2 font-mono text-sm">
                            <span className="font-bold text-gray-900">{pred.forwardLabel}</span>
                            {!pred.isSymmetric && (
                              <>
                                <span className="text-gray-300">/</span>
                                <span className="text-gray-600">{pred.reverseLabel}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full whitespace-nowrap">
                            {count} {count === 1 ? 'edge' : 'edges'}
                          </span>
                          
                          {!pred.isSystem && (
                            <div className="flex gap-1 ml-2">
                              <button onClick={() => handleEditStart(pred)} disabled={isPending || isMigrating} className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer">
                                Edit
                              </button>
                              
                              {count === 0 ? (
                                <button onClick={() => { if (window.confirm(`Are you sure you want to deactivate "${pred.forwardLabel}"?`)) handleDeactivateEmpty(pred.id); }} disabled={isPending} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer">
                                  Deactivate
                                </button>
                              ) : (
                                <button onClick={() => { setMigratingId(isMigrating ? null : pred.id); setEditingId(null); }} disabled={isPending} className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer">
                                  {isMigrating ? "Cancel" : "Deactivate"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Display Restrictions Summary on Active State */}
                      {!pred.isSystem && (pred.sourceLayers || pred.targetLayers) && (
                        <div className="text-[11px] text-gray-500 bg-gray-50 px-3 py-2 rounded border border-gray-100 w-fit">
                          {getLayerSummaryText(pred.sourceLayers || ['IDENTITY', 'PHYSICAL', 'MEDIA'], pred.sourceDefaultKind)}
                          <span className="mx-1.5 opacity-50">→</span>
                          {getLayerSummaryText(pred.isSymmetric ? (pred.sourceLayers || ['IDENTITY', 'PHYSICAL', 'MEDIA']) : (pred.targetLayers || ['IDENTITY', 'PHYSICAL', 'MEDIA']), pred.isSymmetric ? pred.sourceDefaultKind : pred.targetDefaultKind)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Safety Migration Flow */}
                  {isMigrating && (
                    <div className="mt-4 pt-4 border-t border-red-100 bg-red-50/50 -mx-4 -mb-4 p-4 rounded-b-lg animate-in slide-in-from-top-2">
                      <p className="text-xs text-red-800 font-medium mb-3 flex items-center gap-1.5">
                        <span>⚠️</span>
                        To deactivate "{pred.forwardLabel}", you must select a fallback connection for its {count} existing {count === 1 ? 'edge' : 'edges'}.
                      </p>
                      
                      <div className="flex gap-2 flex-col sm:flex-row">
                        <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className="flex-1 p-2 text-sm border border-red-200 rounded focus:ring-2 focus:ring-red-500 outline-none">
                          <option value="">Select fallback connection...</option>
                          {activePredicates.filter(p => p.id !== pred.id && !p.isSystem).map(p => (
                            <option key={p.id} value={p.id}>{p.forwardLabel}</option>
                          ))}
                        </select>
                        <button onClick={() => handleMigrate(pred.id)} disabled={isPending || !targetId} className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-sm">
                          {isPending ? "Migrating..." : "Migrate & Deactivate"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* INACTIVE / DEPRECATED SECTION */}
        {inactivePredicates.length > 0 && (
          <div className="pt-8 mt-8 border-t border-gray-200">
             <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
              Deprecated Connections
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 opacity-60">
              {inactivePredicates.map(pred => (
                <div key={pred.id} className="bg-gray-50 border border-gray-200 rounded p-3 flex flex-col gap-1 grayscale">
                  <span className="text-sm font-medium text-gray-500 line-through">{pred.forwardLabel}</span>
                  {!pred.isSymmetric && (
                    <span className="text-xs text-gray-400 line-through">/ {pred.reverseLabel}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}