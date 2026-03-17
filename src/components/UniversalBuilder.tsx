"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge, createNode, getUploadTicket, attachFileToNode, checkDuplicateArtifact, createPredicate, getExactMatchNode, restoreNode } from "@/app/actions";
import { SYSTEM_PREDICATES } from "@/db/schema";
import { getInferredHint } from "@/lib/dateParser";

type MinimalNode = { 
  id: string; 
  label: string; 
  layer: "IDENTITY" | "PHYSICAL" | "MEDIA"; 
  kind?: string | null; 
  aliases?: string[]; 
  isActive?: boolean;
  notEarlierThan?: string | Date | null;
  notLaterThan?: string | Date | null;
};

type Kind = { id: string; label: string; icon: string; isActive: boolean };

type Predicate = { 
  id: string; 
  forwardLabel: string; 
  reverseLabel: string; 
  isSymmetric: boolean; 
  isSystem: boolean; 
  isActive: boolean;
  sourceLayers?: string[] | null;
  targetLayers?: string[] | null;
  sourceDefaultKind?: string | null;
  targetDefaultKind?: string | null;
};

export type BuilderMode = 'STRUCTURAL' | 'CONTAINMENT' | 'SEMANTIC';
export type Direction = 'FORWARD' | 'REVERSE'; 
export type Gateway = 'IDENTITY' | 'PHYSICAL' | 'FILE' | 'URL';

export interface BuilderConfig {
  mode: BuilderMode;
  direction?: Direction; // Made optional! Semantic mode dynamically handles its own direction.
  allowedGateways: Gateway[];
  buttonLabel: string;
  modalTitle: string;
  icon: string;
  theme: 'blue' | 'amber' | 'emerald' | 'gray';
  hideEdgeProperties?: boolean; 
}

const THEMES = {
  blue: { bg: 'bg-blue-50/30 dark:bg-blue-900/10', border: 'border-blue-200 dark:border-blue-800/50', text: 'text-blue-800 dark:text-blue-400', button: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600', highlight: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800/50', hover: 'hover:bg-blue-100 dark:hover:bg-blue-900/40' },
  amber: { bg: 'bg-amber-50/30 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800/50', text: 'text-amber-800 dark:text-amber-400', button: 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-600', highlight: 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/50', hover: 'hover:bg-amber-100 dark:hover:bg-amber-900/40' },
  emerald: { bg: 'bg-emerald-50/30 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-800/50', text: 'text-emerald-800 dark:text-emerald-400', button: 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600', highlight: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/50', hover: 'hover:bg-emerald-100 dark:hover:bg-emerald-900/40' },
  gray: { bg: 'bg-gray-50 dark:bg-zinc-800/30', border: 'border-gray-200 dark:border-zinc-700/50', text: 'text-gray-800 dark:text-zinc-300', button: 'bg-gray-800 hover:bg-gray-900 text-white dark:bg-zinc-700 dark:hover:bg-zinc-600', highlight: 'bg-gray-100 border-gray-300 dark:bg-zinc-800 dark:border-zinc-600', hover: 'hover:bg-gray-100 dark:hover:bg-zinc-800' }
};

export default function UniversalBuilder({
  sourceNode,
  allNodes,
  activeKinds = [],
  allPredicates = [],
  config
}: {
  sourceNode: MinimalNode;
  allNodes: MinimalNode[];
  activeKinds: Kind[];
  allPredicates?: Predicate[];
  config: BuilderConfig;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'PREDICATE' | 'SEARCH' | 'GATEWAY' | 'FORM' | 'PROPERTIES' | 'EXECUTING'>('SEARCH');
  const [isPending, startTransition] = useTransition();

  // Search & Target State
  const [searchTerm, setSearchTerm] = useState("");
  const [targetId, setTargetId] = useState(""); // If populated, we are linking an existing node
  
  // Minting State (Gateways)
  const [activeGateway, setActiveGateway] = useState<Gateway | null>(null);
  const [mintLabel, setMintLabel] = useState("");
  const [mintKind, setMintKind] = useState(""); // Only used for Identity
  const [file, setFile] = useState<File | null>(null);
  const [payloadHash, setPayloadHash] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  // Dedupe State
  const [duplicateFound, setDuplicateFound] = useState<MinimalNode | null>(null);

  // Properties State (Semantic Edges)
  const [selectedPredicateId, setSelectedPredicateId] = useState("");
  const [selectedPredicateLabel, setSelectedPredicateLabel] = useState("");
  const [temporalInput, setTemporalInput] = useState("");
  const [prevTemporalInput, setPrevTemporalInput] = useState("");
  const [locator, setLocator] = useState("");

  // Inline Predicate Creator State
  const [isCreatingPredicate, setIsCreatingPredicate] = useState(false);
  const [newPredForward, setNewPredForward] = useState("");
  const [newPredReverse, setNewPredReverse] = useState("");
  const [isPredSymmetric, setIsPredSymmetric] = useState(false);

  const theme = THEMES[config.theme] || THEMES.blue;

  // --------------------------------------------------------------------------
  // RESET LOGIC
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) {
      setStep(config.mode === 'SEMANTIC' ? 'PREDICATE' : 'SEARCH');
      setSearchTerm("");
      setTargetId("");
      setActiveGateway(null);
      setMintLabel("");
      setMintKind("");
      setFile(null);
      setPayloadHash("");
      setDuplicateFound(null);
      setSelectedPredicateId("");
      setSelectedPredicateLabel("");
      setTemporalInput("");
      setPrevTemporalInput("");
      setLocator("");
      
      setIsCreatingPredicate(false);
      setNewPredForward("");
      setNewPredReverse("");
      setIsPredSymmetric(false);
      setIsDragging(false);
    }
  }, [isOpen, config.mode]);

  // --------------------------------------------------------------------------
  // DYNAMIC PREDICATE OPTIONS (Loophole A Filter)
  // --------------------------------------------------------------------------
  const semanticOptions = allPredicates?.filter(p => !p.isSystem && p.isActive).flatMap(p => {
    const opts = [];
    
    // Check if the Active Node is legally allowed to be the SOURCE of this predicate
    const sourceAllowed = !p.sourceLayers || p.sourceLayers.length === 0 || p.sourceLayers.includes(sourceNode.layer);
    if (sourceAllowed) {
      opts.push({ v: p.id, l: p.forwardLabel });
    }
    
    // Check if the Active Node is legally allowed to be the TARGET of this predicate (Reverse Link)
    if (!p.isSymmetric) {
      const targetAllowed = !p.targetLayers || p.targetLayers.length === 0 || p.targetLayers.includes(sourceNode.layer);
      if (targetAllowed) {
        opts.push({ v: `${p.id}_REV`, l: p.reverseLabel });
      }
    }
    return opts;
  }).sort((a, b) => a.l.localeCompare(b.l)) || [];

  // --------------------------------------------------------------------------
  // SEARCH FILTERING (Enforcing Graph Physics)
  // --------------------------------------------------------------------------
  
  // Calculate dynamic constraints based on the chosen Predicate
  let targetAllowedLayers = ['IDENTITY', 'PHYSICAL', 'MEDIA'];
  
  if (config.mode === 'SEMANTIC' && selectedPredicateId && selectedPredicateId !== 'CREATE_NEW') {
    const isRev = selectedPredicateId.endsWith('_REV');
    const baseId = selectedPredicateId.replace('_REV', '');
    const p = allPredicates?.find(x => x.id === baseId);
    if (p) {
      // If we are building a Reverse link, the target is actually the Source of the rule!
      const requiredLayers = isRev ? p.sourceLayers : p.targetLayers;
      if (requiredLayers && requiredLayers.length > 0) {
        targetAllowedLayers = requiredLayers;
      }
    }
  }

  // STRICT GRAPH PHYSICS: Filter requested gateways against reality
  const effectiveGateways = config.allowedGateways.filter(g => {
    if (config.mode === 'CONTAINMENT') {
      if (config.direction === 'REVERSE') {
        // Identity and Media can only be Contained In an Identity (Collection)
        if ((sourceNode.layer === 'IDENTITY' || sourceNode.layer === 'MEDIA') && g === 'PHYSICAL') return false;
      } else {
        // Physical can only Contain Physical
        if (sourceNode.layer === 'PHYSICAL' && g !== 'PHYSICAL') return false;
      }
    }
    
    if (config.mode === 'SEMANTIC') {
       if (g === 'FILE' || g === 'URL') return targetAllowedLayers.includes('MEDIA');
       return targetAllowedLayers.includes(g);
    }

    return true;
  });

  const allowedTargets = allNodes.filter(n => {
    // A node can never link to itself
    if (n.id === sourceNode.id) return false;

    // Strict Graph Physics: Prevent peer-to-peer semantics on the Instance layer
    if (config.mode === 'SEMANTIC') {
      if (sourceNode.layer === 'PHYSICAL' && n.layer === 'PHYSICAL') return false;
      if (sourceNode.layer === 'MEDIA' && n.layer === 'MEDIA') return false;
      
      // Override: Apply Dictionary Constraints
      if (!targetAllowedLayers.includes(n.layer)) return false;
    }

    // Strict Graph Physics: Containment Layering
    if (config.mode === 'CONTAINMENT') {
      if (config.direction === 'REVERSE') {
        if ((sourceNode.layer === 'IDENTITY' || sourceNode.layer === 'MEDIA') && n.layer === 'PHYSICAL') return false;
      } else {
        if (sourceNode.layer === 'PHYSICAL' && n.layer !== 'PHYSICAL') return false;
      }
    }

    // Strictly respect the physics-validated effectiveGateways
    if (n.layer === 'IDENTITY' && effectiveGateways.includes('IDENTITY')) return true;
    if (n.layer === 'PHYSICAL' && effectiveGateways.includes('PHYSICAL')) return true;
    if (n.layer === 'MEDIA' && (effectiveGateways.includes('FILE') || effectiveGateways.includes('URL'))) return true;
    
    return false;
  });

  const filteredTargets = searchTerm.trim() === "" 
    ? allowedTargets.slice(0, 10) 
    : allowedTargets.filter(n => 
        n.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase())))
      ).slice(0, 20);

  const getIcon = (n: MinimalNode) => {
    if (n.layer === 'PHYSICAL') return '📦';
    if (n.layer === 'MEDIA') return '🖼️';
    return activeKinds.find(k => k.id === n.kind)?.icon || '🟣';
  };

  // --------------------------------------------------------------------------
  // WORKFLOW HANDLERS
  // --------------------------------------------------------------------------
  
  const proceedToPropertiesOrExecute = (overrideTargetId?: string) => {
    if (config.hideEdgeProperties) {
      executeGraphMutation(overrideTargetId);
    } else {
      setStep('PROPERTIES');
    }
  };

  const handleSelectExisting = (id: string) => {
    setTargetId(id);
    proceedToPropertiesOrExecute(id); 
  };

  const preselectDefaultKind = () => {
    if (config.mode === 'SEMANTIC' && selectedPredicateId && selectedPredicateId !== 'CREATE_NEW') {
      const isRev = selectedPredicateId.endsWith('_REV');
      const baseId = selectedPredicateId.replace('_REV', '');
      const p = allPredicates?.find(x => x.id === baseId);
      if (p) {
        // Loophole D: Verify the default kind is actually still active in the dictionary
        const defKindId = isRev ? p.sourceDefaultKind : p.targetDefaultKind;
        if (defKindId && activeKinds.some(k => k.id === defKindId)) {
          setMintKind(defKindId);
        }
      }
    }
  };

  const handleCreateNewClick = () => {
    if (effectiveGateways.length === 1) {
      setActiveGateway(effectiveGateways[0]);
      setMintLabel(searchTerm);
      if (effectiveGateways[0] === 'IDENTITY') preselectDefaultKind();
      setStep('FORM');
    } else {
      setStep('GATEWAY');
    }
  };

  const handleGatewaySelect = (gateway: Gateway) => {
    setActiveGateway(gateway);
    setMintLabel(searchTerm);
    if (gateway === 'IDENTITY') preselectDefaultKind();
    setStep('FORM');
  };

  // --------------------------------------------------------------------------
  // DRAG & DROP HANDLERS
  // --------------------------------------------------------------------------
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  
  const handleDropForm = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setFile(droppedFile);
      setMintLabel(droppedFile.name);
    }
  };

  const processFormSubmit = async () => {
    if (!activeGateway) return;

    if (activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') {
      // Soft Dedupe Check (Now Alias-Aware AND Trash-Aware!)
      const exactMatch = await getExactMatchNode(mintLabel, activeGateway);

      if (exactMatch) {
        setDuplicateFound(exactMatch as MinimalNode);
        return; 
      }
      proceedToPropertiesOrExecute();
    } 
    else if (activeGateway === 'FILE' || activeGateway === 'URL') {
      // Hard Dedupe Check
      if (activeGateway === 'FILE' && file) {
        const buffer = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
        const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        setPayloadHash(hex);
        
        const existing = await checkDuplicateArtifact(hex);
        if (existing) {
          setDuplicateFound(existing as MinimalNode);
          return;
        }
      } else if (activeGateway === 'URL') {
        let hash = mintLabel.trim();
        const ytMatch = hash.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch && ytMatch[1]) hash = `youtube:${ytMatch[1]}`;
        
        setPayloadHash(hash);
        const existing = await checkDuplicateArtifact(hash);
        if (existing) {
          setDuplicateFound(existing as MinimalNode);
          return;
        }
      }
      proceedToPropertiesOrExecute();
    }
  };

  const handleRestoreFromTrash = () => {
    if (!duplicateFound) return;
    startTransition(async () => {
      await restoreNode(duplicateFound.id);
      handleSelectExisting(duplicateFound.id);
    });
  };

  const handleCreatePredicate = () => {
    if (!newPredForward.trim() || (!isPredSymmetric && !newPredReverse.trim())) return;
    
    startTransition(async () => {
      const forward = newPredForward.toLowerCase().trim();
      const reverse = isPredSymmetric ? forward : newPredReverse.toLowerCase().trim();
      
      const newId = await createPredicate(forward, reverse, isPredSymmetric);
      
      if (newId) {
        setSelectedPredicateId(newId);
        setSelectedPredicateLabel(forward); // Optimistically set the label for the UI
        setStep('SEARCH');
      }

      setIsCreatingPredicate(false);
      setNewPredForward("");
      setNewPredReverse("");
      setIsPredSymmetric(false);
    });
  };

  const executeGraphMutation = (overrideTargetId?: string) => {
    startTransition(async () => {
      setStep('EXECUTING');
      let finalTargetId = overrideTargetId || targetId; 

      // Phase 1: MINTING
      if (!finalTargetId && activeGateway) {
        if (activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') {
          finalTargetId = await createNode(mintLabel.trim(), activeGateway, activeGateway === 'IDENTITY' ? mintKind : null);
        } 
        else if (activeGateway === 'FILE' && file) {
          finalTargetId = await createNode(mintLabel.trim() || file.name, "MEDIA", null);
          const { uploadUrl, fileUrl } = await getUploadTicket(file.name, file.type);
          if (uploadUrl && uploadUrl !== 'mock') {
            await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
          }
          await attachFileToNode(finalTargetId, fileUrl, file.type, file.size, payloadHash);
        } 
        else if (activeGateway === 'URL') {
          finalTargetId = await createNode(mintLabel.trim(), "MEDIA", null);
          await attachFileToNode(finalTargetId, payloadHash.startsWith('youtube:') ? '' : mintLabel.trim(), 'text/html', 0, payloadHash);
        }
      }

      if (!finalTargetId) return setIsOpen(false);

      // Phase 2: GRAPH PHYSICS & LINKING
      let edgeSource = sourceNode.id;
      let edgeTarget = finalTargetId;
      
      if (config.direction === "REVERSE" && config.mode !== 'SEMANTIC') {
        edgeSource = finalTargetId;
        edgeTarget = sourceNode.id;
      }

      let finalPredicate = SYSTEM_PREDICATES.CARRIES;
      if (config.mode === 'CONTAINMENT') finalPredicate = SYSTEM_PREDICATES.CONTAINS;
      if (config.mode === 'SEMANTIC') finalPredicate = selectedPredicateId;

      if (config.mode === 'SEMANTIC' && finalPredicate.endsWith('_REV')) {
        finalPredicate = finalPredicate.replace('_REV', '');
        const temp = edgeSource;
        edgeSource = edgeTarget;
        edgeTarget = temp;
      }

      const edgeProperties = locator.trim() ? { locator: locator.trim() } : {};

      await assertEdge(
        edgeSource,
        edgeTarget,
        finalPredicate,
        config.mode,
        temporalInput || null,
        999, 
        edgeProperties 
      );

      setIsOpen(false);
      if (typeof window !== 'undefined') window.location.reload();
    });
  };

  // --------------------------------------------------------------------------
  // INFERRED PLACEHOLDER CALCULATION
  // --------------------------------------------------------------------------
  let temporalPlaceholder = "e.g. 1995~1998";
  if (temporalInput === 'TIMELESS') {
    temporalPlaceholder = "Timeless Relationship";
  } else if (targetId) {
    const targetNode = allNodes.find(n => n.id === targetId);
    const aStart = sourceNode.notEarlierThan ? new Date(sourceNode.notEarlierThan).getTime() : null;
    const aEnd = sourceNode.notLaterThan ? new Date(sourceNode.notLaterThan).getTime() : null;
    const bStart = targetNode?.notEarlierThan ? new Date(targetNode.notEarlierThan).getTime() : null;
    const bEnd = targetNode?.notLaterThan ? new Date(targetNode.notLaterThan).getTime() : null;
    
    const maxStart = aStart && bStart ? Math.max(aStart, bStart) : (aStart || bStart);
    const minEnd = aEnd && bEnd ? Math.min(aEnd, bEnd) : (aEnd || bEnd);

    // Only show inference if they logically overlap (or have open ends)
    if (!(maxStart && minEnd && maxStart > minEnd) && (maxStart || minEnd)) {
      temporalPlaceholder = getInferredHint(maxStart, minEnd);
    }
  }

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  return (
    <>
      <button 
        onClick={() => {
          // RACE CONDITION FIX: Set the term synchronously BEFORE the modal renders
          // so that the autoFocus input has text ready to be highlighted.
          setSearchTerm(sourceNode.label);
          setIsOpen(true);
        }}
        className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border flex items-center gap-1.5 ${theme.text} ${theme.bg} ${theme.border} ${theme.hover}`}
      >
        <span>+ {config.buttonLabel}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/30 dark:bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setIsOpen(false)}>
          <div 
            className={`relative w-full max-w-xl max-h-[90vh] overflow-y-auto border rounded-xl shadow-2xl p-5 md:p-7 text-left transition-colors cursor-default bg-white dark:bg-zinc-950 ${theme.border}`} 
            onClick={e => e.stopPropagation()}
          >
            <div className="font-medium text-gray-900 dark:text-zinc-100 pb-3 border-b border-gray-100 dark:border-zinc-800/50 flex items-center justify-between mb-5">
              <span className="flex items-center gap-2 text-base"><span>{config.icon}</span> {config.modalTitle}</span>
              <button onClick={() => setIsOpen(false)} disabled={isPending} className="text-gray-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors cursor-pointer p-1">✕</button>
            </div>

            <div className="space-y-4">
              
              {/* STEP 0: PREDICATE SELECTOR (Semantic Mode Only) */}
              {step === 'PREDICATE' && config.mode === 'SEMANTIC' && (
                <div className="animate-in fade-in slide-in-from-right-2">
                   {isCreatingPredicate ? (
                      <div className="animate-in fade-in slide-in-from-top-1 bg-gray-50/50 dark:bg-zinc-900 p-4 rounded-lg border border-gray-200 dark:border-zinc-700 shadow-sm transition-colors">
                        <div className="font-medium text-gray-700 dark:text-zinc-300 mb-4 flex flex-wrap justify-between items-center border-b border-gray-100 dark:border-zinc-800 pb-2 gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-800 dark:text-zinc-200">✨ Define New Semantic Pair</span>
                          <button onClick={() => setIsCreatingPredicate(false)} className="text-gray-400 hover:text-gray-800 dark:hover:text-zinc-200 cursor-pointer px-1">✕</button>
                        </div>
                        
                        <div className="flex flex-col gap-3">
                          <div>
                            <span className="text-gray-500 dark:text-zinc-400 text-[10px] font-bold uppercase block mb-1">Forward Label</span>
                            <input 
                              type="text" placeholder="e.g. influenced by" 
                              value={newPredForward} onChange={e => setNewPredForward(e.target.value)}
                              disabled={isPending}
                              className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
                            />
                          </div>
                          
                          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-zinc-400 cursor-pointer font-medium w-fit py-1">
                            <input 
                              type="checkbox" 
                              checked={isPredSymmetric} 
                              onChange={e => setIsPredSymmetric(e.target.checked)} 
                              className="rounded border-gray-300 dark:border-zinc-600 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer bg-white dark:bg-zinc-900"
                            />
                            Is symmetric (e.g. "married to")
                          </label>

                          {!isPredSymmetric && (
                            <div className="animate-in fade-in">
                              <span className="text-gray-500 dark:text-zinc-400 text-[10px] font-bold uppercase block mb-1">Reverse Label</span>
                              <input 
                                type="text" placeholder="e.g. influence on" 
                                value={newPredReverse} onChange={e => setNewPredReverse(e.target.value)}
                                disabled={isPending}
                                className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
                              />
                            </div>
                          )}
                          
                          <div className="flex gap-2 pt-2 mt-1 border-t border-gray-100 dark:border-zinc-800">
                            <button 
                              onClick={handleCreatePredicate} 
                              disabled={isPending || !newPredForward.trim() || (!isPredSymmetric && !newPredReverse.trim())}
                              className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-sm disabled:opacity-50 cursor-pointer transition-colors"
                            >
                              {isPending ? "Saving..." : "Save Pair to Dictionary"}
                            </button>
                            <button 
                              onClick={() => setIsCreatingPredicate(false)} 
                              disabled={isPending}
                              className="px-3 py-2 text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 cursor-pointer transition-colors text-xs font-medium"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                   ) : (
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-2">How is {sourceNode.label} connected?</label>
                        <select 
                          value={selectedPredicateId || ""} 
                          onChange={e => {
                            if (e.target.value === "CREATE_NEW") setIsCreatingPredicate(true);
                            else if (e.target.value) {
                              const opt = semanticOptions.find(o => o.v === e.target.value);
                              setSelectedPredicateLabel(opt?.l || "");
                              setSelectedPredicateId(e.target.value);
                              setStep('SEARCH');
                            }
                          }}
                          className={`w-full p-3 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-zinc-900 ${theme.border} shadow-sm text-gray-900 dark:text-zinc-100 font-medium cursor-pointer transition-colors`}
                        >
                          <option value="">Select connection verb...</option>
                          {semanticOptions.map(opt => (
                            <option key={opt.v} value={opt.v}>{opt.l}</option>
                          ))}
                          <option value="CREATE_NEW" className="font-bold text-blue-600 dark:text-blue-400">+ Create new semantic pair...</option>
                        </select>
                      </div>
                   )}
                </div>
              )}

              {/* STEP 1: UNIVERSAL SEARCH */}
              {step === 'SEARCH' && (
                <div className="animate-in fade-in">
                   {config.mode === 'SEMANTIC' && selectedPredicateLabel && (
                     <div className="mb-4 p-2.5 bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-800/50 rounded-lg text-sm text-gray-700 dark:text-zinc-300 flex items-center justify-between shadow-sm transition-colors">
                       <span className="truncate flex items-center">
                          <span className="font-medium text-gray-900 dark:text-zinc-100 max-w-[120px] sm:max-w-xs truncate">{sourceNode.label}</span>
                          <span className="font-bold mx-2 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-800/30">{selectedPredicateLabel}</span>
                          ...
                       </span>
                       <button onClick={() => { setStep('PREDICATE'); setSelectedPredicateId(""); setSelectedPredicateLabel(""); setSearchTerm(sourceNode.label); }} className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-zinc-500 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer shrink-0 ml-2 transition-colors">Change</button>
                     </div>
                   )}

                   <input 
                     type="text" 
                     placeholder="Search graph by name or alias..."
                     value={searchTerm}
                     onChange={e => setSearchTerm(e.target.value)}
                     autoFocus
                     onFocus={e => e.target.select()}
                     className={`w-full p-2.5 text-sm border rounded-lg outline-none shadow-sm focus:ring-2 ${theme.border} focus:ring-blue-500 bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 mb-2 transition-colors`}
                   />

                   {searchTerm.length > 0 && (
                      <div className="max-h-48 overflow-y-auto border border-gray-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 shadow-inner transition-colors">
                        {filteredTargets.length === 0 ? (
                          <div className="p-4 text-xs text-gray-400 dark:text-zinc-500 italic text-center">No valid records found matching these constraints.</div>
                        ) : (
                          <div className="flex flex-col">
                            {filteredTargets.map(n => (
                              <button
                                key={n.id} onClick={() => handleSelectExisting(n.id)}
                                className="flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors border-b border-gray-50 dark:border-zinc-800 last:border-0 hover:bg-gray-50 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300 cursor-pointer"
                              >
                                <span className="opacity-80 text-lg leading-none">{getIcon(n)}</span>
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="truncate">
                                    {n.label}
                                    {n.aliases && n.aliases.length > 0 && (
                                      <span className="text-gray-400 dark:text-zinc-500 font-normal ml-1.5 text-xs truncate">({n.aliases.join(', ')})</span>
                                    )}
                                  </span>
                                  <span className="text-[9px] text-gray-400 dark:text-zinc-500 font-mono tracking-tighter uppercase truncate">{n.layer}</span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                        {effectiveGateways.length > 0 && (
                          <div 
                            onClick={handleCreateNewClick}
                            className="p-3 text-sm text-blue-600 dark:text-blue-400 font-bold bg-blue-50/50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 cursor-pointer border-t border-blue-100 dark:border-blue-800/30 flex items-center gap-2 transition-colors"
                          >
                            <span>✨</span> + Mint "{searchTerm}" as new record...
                          </div>
                        )}
                      </div>
                   )}
                   
                   {config.mode === 'SEMANTIC' && (
                      <div className="flex justify-start mt-4 pt-3 border-t border-gray-100 dark:border-zinc-800">
                        <button onClick={() => { setStep('PREDICATE'); setSelectedPredicateId(""); setSelectedPredicateLabel(""); setSearchTerm(sourceNode.label); }} className="text-xs text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors cursor-pointer flex items-center gap-1 font-medium">← Back to verb selection</button>
                      </div>
                   )}
                </div>
              )}

              {/* STEP 2: GATEWAY SELECTOR */}
              {step === 'GATEWAY' && (
                <div className="animate-in slide-in-from-right-2">
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-3">What kind of record are you creating?</label>
                  <div className="grid grid-cols-2 gap-3">
                    {effectiveGateways.includes('IDENTITY') && (
                      <button onClick={() => handleGatewaySelect('IDENTITY')} className="p-4 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors cursor-pointer shadow-sm">
                        <span className="block text-2xl mb-1.5">🟣</span>
                        <span className="font-bold text-sm text-gray-900 dark:text-zinc-100 block">Abstract Concept</span>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-400">People, works, events</span>
                      </button>
                    )}
                    {effectiveGateways.includes('PHYSICAL') && (
                      <button onClick={() => handleGatewaySelect('PHYSICAL')} className="p-4 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-left transition-colors cursor-pointer shadow-sm">
                        <span className="block text-2xl mb-1.5">📦</span>
                        <span className="font-bold text-sm text-gray-900 dark:text-zinc-100 block">Physical Item</span>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-400">Tangible objects/boxes</span>
                      </button>
                    )}
                    {effectiveGateways.includes('FILE') && (
                      <button onClick={() => handleGatewaySelect('FILE')} className="p-4 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors cursor-pointer shadow-sm">
                        <span className="block text-2xl mb-1.5">📄</span>
                        <span className="font-bold text-sm text-gray-900 dark:text-zinc-100 block">Upload File</span>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-400">Images, videos, PDFs</span>
                      </button>
                    )}
                    {effectiveGateways.includes('URL') && (
                      <button onClick={() => handleGatewaySelect('URL')} className="p-4 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-lg hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors cursor-pointer shadow-sm">
                        <span className="block text-2xl mb-1.5">🔗</span>
                        <span className="font-bold text-sm text-gray-900 dark:text-zinc-100 block">Web URL</span>
                        <span className="text-[10px] text-gray-500 dark:text-zinc-400">External links, YouTube</span>
                      </button>
                    )}
                  </div>
                  <button onClick={() => setStep('SEARCH')} className="mt-5 text-xs font-medium text-gray-500 dark:text-zinc-400 hover:underline cursor-pointer">← Back to Search</button>
                </div>
              )}

              {/* STEP 3: CREATION FORMS */}
              {step === 'FORM' && activeGateway && (
                <div className="animate-in slide-in-from-right-2 p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm transition-colors">
                  
                  {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-1">Name / Primary Label</label>
                        <input type="text" autoFocus onFocus={e => e.target.select()} value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm" />
                      </div>
                      {activeGateway === 'IDENTITY' && (
                        <div>
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-1">Taxonomy Classification</label>
                          <select value={mintKind} onChange={e => setMintKind(e.target.value)} className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm">
                            <option value="">Select Kind...</option>
                            {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                          </select>
                        </div>
                      )}
                      {activeGateway === 'PHYSICAL' && (
                        <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">Additional properties (like Location or Condition) can be added after creation.</p>
                      )}
                    </div>
                  )}

                  {activeGateway === 'FILE' && (
                    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDropForm}>
                      <input type="file" className="hidden" id="ub-file" onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setMintLabel(e.target.files[0].name); } }} />
                      <label htmlFor="ub-file" className={`block p-8 rounded-lg border-2 border-dashed text-center transition-colors cursor-pointer mb-4 ${isDragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800/50 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:border-gray-400 dark:hover:border-zinc-600'}`}>
                        <span className="text-3xl mb-2 block">{file ? '✅' : isDragging ? '📥' : '📄'}</span>
                        <span className="text-xs text-gray-600 dark:text-zinc-400 font-medium">{file ? file.name : isDragging ? 'Drop it here!' : 'Click to browse or drag file here'}</span>
                      </label>
                      {file && (
                        <div onClick={e => e.stopPropagation()}>
                           <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-1">Artifact Title</label>
                           <input type="text" autoFocus onFocus={e => e.target.select()} value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm" />
                        </div>
                      )}
                    </div>
                  )}

                  {activeGateway === 'URL' && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase mb-1">Web Address / URL</label>
                      <input type="url" autoFocus onFocus={e => e.target.select()} placeholder="https://" value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 transition-colors shadow-sm" />
                      <p className="text-[10px] text-gray-400 dark:text-zinc-500 font-medium">YouTube URLs will be automatically detected and converted into playable iframes.</p>
                    </div>
                  )}

                  {/* TRASH-AWARE DEDUPLICATION WARNING */}
                  {duplicateFound && (
                    <div className={`mt-5 p-4 border rounded-lg transition-colors shadow-sm ${duplicateFound.isActive === false ? 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'}`}>
                      {duplicateFound.isActive === false ? (
                        <>
                          <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 mb-1 flex items-center gap-1.5"><span>🗑️</span> Found in Trash</p>
                          <p className="text-xs text-gray-600 dark:text-zinc-400 mb-3">"{duplicateFound.label}" exists, but it was moved to the trash.</p>
                          <button onClick={handleRestoreFromTrash} disabled={isPending} className="w-full py-2 bg-gray-800 dark:bg-zinc-700 text-white text-xs font-bold rounded hover:bg-gray-900 dark:hover:bg-zinc-600 cursor-pointer shadow-sm transition-colors">
                            {isPending ? "..." : "Restore & Use Record"}
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1.5"><span>⚠️</span> Exact Match Found</p>
                          <p className="text-xs text-amber-700 dark:text-amber-500 mb-4">
                            "{duplicateFound.label}"
                            {duplicateFound.aliases && duplicateFound.aliases.length > 0 && (
                              <span className="opacity-80"> ({duplicateFound.aliases.join(', ')})</span>
                            )} already exists.
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => handleSelectExisting(duplicateFound.id)} className="flex-1 py-2 bg-amber-600 dark:bg-amber-700 text-white text-xs font-bold rounded shadow-sm hover:bg-amber-700 dark:hover:bg-amber-600 cursor-pointer transition-colors">Use Existing</button>
                            {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                              <button onClick={() => proceedToPropertiesOrExecute()} className="flex-1 py-2 bg-white dark:bg-zinc-900 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 text-xs font-bold rounded shadow-sm hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer transition-colors">Mint Duplicate</button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100 dark:border-zinc-800">
                    <button onClick={() => setStep(effectiveGateways.length === 1 ? 'SEARCH' : 'GATEWAY')} className="text-xs font-medium text-gray-500 dark:text-zinc-400 hover:underline cursor-pointer">← Back</button>
                    {!duplicateFound && (
                      <button 
                        onClick={processFormSubmit} 
                        disabled={(activeGateway === 'IDENTITY' && (!mintLabel || !mintKind)) || (activeGateway === 'PHYSICAL' && !mintLabel) || (activeGateway === 'FILE' && !file) || (activeGateway === 'URL' && !mintLabel)}
                        className="px-5 py-2 bg-blue-600 text-white text-xs font-bold rounded shadow-sm disabled:opacity-50 cursor-pointer hover:bg-blue-700 transition-colors"
                      >
                        Continue →
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: PROPERTIES (Temporal/Locator) */}
              {step === 'PROPERTIES' && (
                <div className="animate-in slide-in-from-right-2 p-5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm transition-colors">
                   
                   {/* Changed to flex-col to prevent any squishing */}
                   <div className="flex flex-col gap-5 mb-5">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                          <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest">Temporal Bounds</label>
                          <label className="flex items-center gap-1.5 cursor-pointer" title="Mark this relationship as timeless (e.g. Influence)">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase">Timeless</span>
                            <div className="relative inline-flex items-center">
                              <input 
                                type="checkbox" 
                                checked={temporalInput === 'TIMELESS'}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setPrevTemporalInput(temporalInput !== 'TIMELESS' ? temporalInput : "");
                                    setTemporalInput('TIMELESS');
                                  } else {
                                    setTemporalInput(prevTemporalInput);
                                  }
                                }}
                                className="sr-only peer"
                              />
                              <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                            </div>
                          </label>
                        </div>
                        <input 
                          type="text" 
                          placeholder={temporalPlaceholder} 
                          value={temporalInput === 'TIMELESS' ? '' : temporalInput} 
                          onChange={(e) => setTemporalInput(e.target.value)} 
                          disabled={temporalInput === 'TIMELESS'}
                          className={`w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors ${temporalInput === 'TIMELESS' ? 'bg-gray-100 dark:bg-zinc-800/50 cursor-not-allowed placeholder-gray-400 dark:placeholder-zinc-500' : 'bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 placeholder:text-gray-400 dark:placeholder:text-zinc-500'}`} 
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1.5">Locator / Position (Optional)</label>
                        <input type="text" placeholder="e.g. Page 42, Top-left" value={locator} onChange={(e) => setLocator(e.target.value)} className="w-full p-2.5 text-sm border border-gray-300 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors" />
                      </div>
                   </div>

                   <div className="flex justify-between items-center pt-4 border-t border-gray-100 dark:border-zinc-800">
                      <button onClick={() => setStep(targetId ? 'SEARCH' : 'FORM')} className="text-xs font-medium text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors cursor-pointer">← Back</button>
                      <button 
                        onClick={() => executeGraphMutation()} 
                        disabled={config.mode === 'SEMANTIC' && (!selectedPredicateId || isCreatingPredicate)}
                        className={`px-6 py-2.5 text-xs font-bold uppercase tracking-widest rounded-md shadow-sm disabled:opacity-50 cursor-pointer ${theme.button} transition-colors`}
                      >
                        Save Link
                      </button>
                   </div>
                </div>
              )}

              {/* STEP 5: EXECUTING */}
              {step === 'EXECUTING' && (
                <div className="py-12 text-center animate-in fade-in flex flex-col items-center gap-4 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg transition-colors shadow-sm">
                  <span className="text-4xl animate-spin text-blue-600 dark:text-blue-400">🌀</span>
                  <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Processing Transaction...</p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}