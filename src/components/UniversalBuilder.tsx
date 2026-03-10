"use client";

import { useState, useTransition, useEffect } from "react";
import { assertEdge, createNode, getUploadTicket, attachFileToNode, checkDuplicateArtifact, createPredicate } from "@/app/actions";
import { SYSTEM_PREDICATES } from "@/db/schema";

type MinimalNode = { id: string; label: string; layer: "IDENTITY" | "PHYSICAL" | "MEDIA"; kind?: string | null; aliases?: string[] };
type Kind = { id: string; label: string; icon: string; isActive: boolean };
type Predicate = { id: string; forwardLabel: string; reverseLabel: string; isSymmetric: boolean; isSystem: boolean; isActive: boolean };

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
  blue: { bg: 'bg-blue-50/30', border: 'border-blue-200', text: 'text-blue-800', button: 'bg-blue-600 hover:bg-blue-700 text-white', highlight: 'bg-blue-50 border-blue-200', hover: 'hover:bg-blue-100' },
  amber: { bg: 'bg-amber-50/30', border: 'border-amber-200', text: 'text-amber-800', button: 'bg-amber-600 hover:bg-amber-700 text-white', highlight: 'bg-amber-50 border-amber-200', hover: 'hover:bg-amber-100' },
  emerald: { bg: 'bg-emerald-50/30', border: 'border-emerald-200', text: 'text-emerald-800', button: 'bg-emerald-600 hover:bg-emerald-700 text-white', highlight: 'bg-emerald-50 border-emerald-200', hover: 'hover:bg-emerald-100' },
  gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', button: 'bg-gray-800 hover:bg-gray-900 text-white', highlight: 'bg-gray-100 border-gray-300', hover: 'hover:bg-gray-100' }
};

export default function UniversalBuilder({
  sourceNode,
  allNodes,
  activeKinds,
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
  const [step, setStep] = useState<'SEARCH' | 'GATEWAY' | 'FORM' | 'PROPERTIES' | 'EXECUTING'>('SEARCH');
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
  
  // Dedupe State
  const [duplicateFound, setDuplicateFound] = useState<MinimalNode | null>(null);

  // Properties State (Semantic Edges)
  const [selectedPredicateId, setSelectedPredicateId] = useState("");
  const [temporalInput, setTemporalInput] = useState("");
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
      setStep('SEARCH');
      setSearchTerm("");
      setTargetId("");
      setActiveGateway(null);
      setMintLabel("");
      setMintKind("");
      setFile(null);
      setPayloadHash("");
      setDuplicateFound(null);
      setSelectedPredicateId("");
      setTemporalInput("");
      setLocator("");
      
      setIsCreatingPredicate(false);
      setNewPredForward("");
      setNewPredReverse("");
      setIsPredSymmetric(false);
    }
  }, [isOpen]);

  // --------------------------------------------------------------------------
  // SEARCH FILTERING (Enforcing Graph Physics)
  // --------------------------------------------------------------------------
  
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
    return true;
  });

  const allowedTargets = allNodes.filter(n => {
    if (n.id === sourceNode.id) return false;

    // Strict Graph Physics: Prevent peer-to-peer semantics on the Instance layer
    if (config.mode === 'SEMANTIC') {
      if (sourceNode.layer === 'PHYSICAL' && n.layer === 'PHYSICAL') return false;
      if (sourceNode.layer === 'MEDIA' && n.layer === 'MEDIA') return false;
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
    proceedToPropertiesOrExecute(id); // Pass the ID directly so we don't rely on async state!
  };

  const handleCreateNewClick = () => {
    if (effectiveGateways.length === 1) {
      setActiveGateway(effectiveGateways[0]);
      setMintLabel(searchTerm);
      setStep('FORM');
    } else {
      setStep('GATEWAY');
    }
  };

  const processFormSubmit = async () => {
    if (!activeGateway) return;

    if (activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') {
      // Soft Dedupe Check
      const exactMatch = allNodes.find(n => n.layer === activeGateway && n.label.toLowerCase() === mintLabel.toLowerCase().trim());
      if (exactMatch) {
        setDuplicateFound(exactMatch);
        return; // UI pauses to show warning
      }
      proceedToPropertiesOrExecute();
    } 
    else if (activeGateway === 'FILE' || activeGateway === 'URL') {
      // Hard Dedupe Check (Handled implicitly by hash collision detection below)
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
        // YouTube parsing
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

  const handleCreatePredicate = () => {
    if (!newPredForward.trim() || (!isPredSymmetric && !newPredReverse.trim())) return;
    
    startTransition(async () => {
      const forward = newPredForward.toLowerCase().trim();
      const reverse = isPredSymmetric ? forward : newPredReverse.toLowerCase().trim();
      
      // Fire action and receive the new UUID
      const newId = await createPredicate(forward, reverse, isPredSymmetric);
      
      if (newId) {
        // Auto-select the newly minted predicate so they can instantly hit "Save Link"
        setSelectedPredicateId(newId);
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
      let finalTargetId = overrideTargetId || targetId; // Use the override if provided!

      // Phase 1: MINTING (Only if targetId is NOT set. This fixes the dedupe bug!)
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
      
      // FIX: Semantic mode dictates its own direction via the verb selection (_REV).
      // Applying the structural config.direction here caused a "double flip" bug.
      if (config.direction === "REVERSE" && config.mode !== 'SEMANTIC') {
        edgeSource = finalTargetId;
        edgeTarget = sourceNode.id;
      }

      let finalPredicate = SYSTEM_PREDICATES.CARRIES;
      if (config.mode === 'CONTAINMENT') finalPredicate = SYSTEM_PREDICATES.CONTAINS;
      if (config.mode === 'SEMANTIC') finalPredicate = selectedPredicateId;

      // -------------------------------------------------------------
      // Handle Reverse Semantic Predicates (_REV tag from UI)
      // -------------------------------------------------------------
      if (config.mode === 'SEMANTIC' && finalPredicate.endsWith('_REV')) {
        finalPredicate = finalPredicate.replace('_REV', '');
        // Flip the directional arrow since the user chose the reverse reading
        const temp = edgeSource;
        edgeSource = edgeTarget;
        edgeTarget = temp;
      }
      // -------------------------------------------------------------

      const edgeProperties = locator.trim() ? { locator: locator.trim() } : {};

      // FIX: Ensure parameters map strictly to actions.ts signature.
      // assertEdge(sourceId, targetId, predicateId, category, temporalInput, sortOrder, properties)
      await assertEdge(
        edgeSource,
        edgeTarget,
        finalPredicate,
        config.mode,
        temporalInput || null,
        999, // Map sorting weight correctly to the 6th parameter
        edgeProperties // Map properties cleanly to the 7th parameter
      );

      setIsOpen(false);
      // Reload to ensure state cleanly refreshes
      if (typeof window !== 'undefined') window.location.reload();
    });
  };

  // --------------------------------------------------------------------------
  // RENDER HELPERS
  // --------------------------------------------------------------------------

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border flex items-center gap-1.5 ${theme.text} ${theme.bg} ${theme.border} ${theme.hover}`}
      >
        <span>+ {config.buttonLabel}</span>
      </button>
    );
  }

  return (
    <div className={`mt-4 border rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-2 text-left ${theme.bg} ${theme.border}`}>
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>{config.icon}</span> {config.modalTitle}</span>
        <button onClick={() => setIsOpen(false)} disabled={isPending} className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">✕</button>
      </div>

      <div className="space-y-4">
        
        {/* STEP 1: UNIVERSAL SEARCH */}
        {step === 'SEARCH' && (
          <div className="animate-in fade-in">
             <input 
               type="text" 
               placeholder="Search graph by name or alias..."
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               autoFocus
               className={`w-full p-2 text-xs border rounded outline-none shadow-sm focus:ring-2 ${theme.border} focus:ring-blue-500 bg-white text-gray-900 mb-2`}
             />

             {searchTerm.length > 0 && (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md bg-white shadow-inner">
                  {filteredTargets.length === 0 ? (
                    <div className="p-3 text-xs text-gray-400 italic text-center">No matching records found.</div>
                  ) : (
                    <div className="flex flex-col">
                      {filteredTargets.map(n => (
                        <button
                          key={n.id} onClick={() => handleSelectExisting(n.id)}
                          className="flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors border-b border-gray-50 last:border-0 hover:bg-gray-50 text-gray-700 cursor-pointer"
                        >
                          <span className="opacity-80 text-lg leading-none">{getIcon(n)}</span>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="truncate">
                              {n.label}
                              {n.aliases && n.aliases.length > 0 && (
                                <span className="text-gray-400 font-normal ml-1.5 text-xs truncate">({n.aliases.join(', ')})</span>
                              )}
                            </span>
                            <span className="text-[9px] text-gray-400 font-mono tracking-tighter uppercase truncate">{n.layer}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div 
                    onClick={handleCreateNewClick}
                    className="p-2 text-sm text-blue-600 font-bold bg-blue-50/50 hover:bg-blue-100 cursor-pointer border-t border-blue-100 flex items-center gap-2"
                  >
                    <span>✨</span> + Mint "{searchTerm}" as new record...
                  </div>
                </div>
             )}
          </div>
        )}

        {/* STEP 2: GATEWAY SELECTOR */}
        {step === 'GATEWAY' && (
          <div className="animate-in slide-in-from-right-2">
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">What kind of record are you creating?</label>
            <div className="grid grid-cols-2 gap-2">
              {effectiveGateways.includes('IDENTITY') && (
                <button onClick={() => { setActiveGateway('IDENTITY'); setMintLabel(searchTerm); setStep('FORM'); }} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors">
                  <span className="block text-xl mb-1">🟣</span>
                  <span className="font-bold text-xs text-gray-900 block">Abstract Concept</span>
                  <span className="text-[10px] text-gray-500">People, works, events</span>
                </button>
              )}
              {effectiveGateways.includes('PHYSICAL') && (
                <button onClick={() => { setActiveGateway('PHYSICAL'); setMintLabel(searchTerm); setStep('FORM'); }} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-amber-300 hover:bg-amber-50 text-left transition-colors">
                  <span className="block text-xl mb-1">📦</span>
                  <span className="font-bold text-xs text-gray-900 block">Physical Item</span>
                  <span className="text-[10px] text-gray-500">Tangible objects/boxes</span>
                </button>
              )}
              {effectiveGateways.includes('FILE') && (
                <button onClick={() => { setActiveGateway('FILE'); setStep('FORM'); }} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors">
                  <span className="block text-xl mb-1">📄</span>
                  <span className="font-bold text-xs text-gray-900 block">Upload File</span>
                  <span className="text-[10px] text-gray-500">Images, videos, PDFs</span>
                </button>
              )}
              {effectiveGateways.includes('URL') && (
                <button onClick={() => { setActiveGateway('URL'); setStep('FORM'); }} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors">
                  <span className="block text-xl mb-1">🔗</span>
                  <span className="font-bold text-xs text-gray-900 block">Web URL</span>
                  <span className="text-[10px] text-gray-500">External links, YouTube</span>
                </button>
              )}
            </div>
            <button onClick={() => setStep('SEARCH')} className="mt-4 text-xs text-gray-500 hover:underline">← Back to Search</button>
          </div>
        )}

        {/* STEP 3: CREATION FORMS */}
        {step === 'FORM' && activeGateway && (
          <div className="animate-in slide-in-from-right-2 p-4 bg-white border border-gray-200 rounded-md shadow-sm">
            
            {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Name / Primary Label</label>
                  <input type="text" autoFocus value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {activeGateway === 'IDENTITY' && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Taxonomy Classification</label>
                    <select value={mintKind} onChange={e => setMintKind(e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select Kind...</option>
                      {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                    </select>
                  </div>
                )}
                {activeGateway === 'PHYSICAL' && (
                  <p className="text-[10px] text-gray-400 font-medium">Additional properties (like Location or Condition) can be added after creation.</p>
                )}
              </div>
            )}

            {activeGateway === 'FILE' && (
              <div>
                <input type="file" className="hidden" id="ub-file" onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setMintLabel(e.target.files[0].name); } }} />
                <label htmlFor="ub-file" className="block p-6 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 text-center cursor-pointer mb-3">
                  <span className="text-2xl mb-1 block">{file ? '✅' : '📥'}</span>
                  <span className="text-xs text-gray-600 font-medium">{file ? file.name : 'Click to select a file'}</span>
                </label>
                {file && (
                  <div>
                     <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Artifact Title</label>
                     <input type="text" value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                )}
              </div>
            )}

            {activeGateway === 'URL' && (
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Web Address / URL</label>
                <input type="url" placeholder="https://" value={mintLabel} onChange={e => setMintLabel(e.target.value)} className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2" />
                <p className="text-[10px] text-gray-400 font-medium">YouTube URLs will be automatically detected and converted into playable iframes.</p>
              </div>
            )}

            {/* Dedupe Warning Interceptor */}
            {duplicateFound && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-1"><span>⚠️</span> Exact Match Found</p>
                <p className="text-[10px] text-amber-700 mb-3">"{duplicateFound.label}" already exists in the graph.</p>
                <div className="flex gap-2">
                  <button onClick={() => handleSelectExisting(duplicateFound.id)} className="flex-1 py-1.5 bg-amber-600 text-white text-xs font-bold rounded shadow-sm hover:bg-amber-700 cursor-pointer">Use Existing</button>
                  {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                    <button onClick={() => proceedToPropertiesOrExecute()} className="flex-1 py-1.5 bg-white text-amber-700 border border-amber-200 text-xs font-bold rounded shadow-sm hover:bg-amber-100 cursor-pointer">Mint Duplicate</button>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-5 pt-3 border-t border-gray-100">
              <button onClick={() => setStep(effectiveGateways.length === 1 ? 'SEARCH' : 'GATEWAY')} className="text-xs text-gray-500 hover:underline cursor-pointer">← Back</button>
              {!duplicateFound && (
                <button 
                  onClick={processFormSubmit} 
                  disabled={(activeGateway === 'IDENTITY' && (!mintLabel || !mintKind)) || (activeGateway === 'PHYSICAL' && !mintLabel) || (activeGateway === 'FILE' && !file) || (activeGateway === 'URL' && !mintLabel)}
                  className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  Continue →
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: SEMANTIC PROPERTIES (Temporal/Locator) */}
        {step === 'PROPERTIES' && (
          <div className="animate-in slide-in-from-right-2 p-4 bg-white border border-gray-200 rounded-md shadow-sm">
             {config.mode === 'SEMANTIC' && (
                isCreatingPredicate ? (
                  <div className="mb-4 pb-4 border-b border-gray-100 animate-in fade-in slide-in-from-top-1">
                    <div className="font-medium text-gray-700 mb-3 flex justify-between items-center">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-800">✨ Define New Semantic Pair</span>
                      <button onClick={() => setIsCreatingPredicate(false)} className="text-gray-400 hover:text-gray-800 cursor-pointer">✕</button>
                    </div>
                    <div className="space-y-3">
                      <div className="flex gap-2 items-center">
                        <span className="w-16 text-gray-500 text-[10px] font-bold text-right uppercase">Forward</span>
                        <input 
                          type="text" placeholder="e.g. influenced by" 
                          value={newPredForward} onChange={e => setNewPredForward(e.target.value)}
                          disabled={isPending}
                          className="p-1.5 text-sm border border-gray-300 rounded text-gray-900 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                        />
                      </div>
                      <div className="flex gap-2 items-center sm:ml-18">
                        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer font-medium">
                          <input 
                            type="checkbox" 
                            checked={isPredSymmetric} 
                            onChange={e => setIsPredSymmetric(e.target.checked)} 
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                          />
                          Is symmetric (e.g. "married to")
                        </label>
                      </div>
                      {!isPredSymmetric && (
                        <div className="flex gap-2 items-center animate-in fade-in">
                          <span className="w-16 text-gray-500 text-[10px] font-bold text-right uppercase">Reverse</span>
                          <input 
                            type="text" placeholder="e.g. influence on" 
                            value={newPredReverse} onChange={e => setNewPredReverse(e.target.value)}
                            disabled={isPending}
                            className="p-1.5 text-sm border border-gray-300 rounded text-gray-900 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                          />
                        </div>
                      )}
                      <div className="flex gap-2 sm:ml-18 pt-2">
                        <button 
                          onClick={handleCreatePredicate} 
                          disabled={isPending || !newPredForward.trim() || (!isPredSymmetric && !newPredReverse.trim())}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 shadow-sm disabled:opacity-50 cursor-pointer"
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
                  </div>
                ) : (
                  <div className="mb-4 pb-4 border-b border-gray-100">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Select Connection Verb</label>
                    <select 
                      value={selectedPredicateId} 
                      onChange={e => {
                        if (e.target.value === "CREATE_NEW") setIsCreatingPredicate(true);
                        else setSelectedPredicateId(e.target.value);
                      }}
                      className="w-full p-2 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select predicate...</option>
                      {allPredicates?.filter(p => !p.isSystem && p.isActive).flatMap(p => p.isSymmetric ? [{ v: p.id, l: p.forwardLabel }] : [{ v: p.id, l: p.forwardLabel }, { v: `${p.id}_REV`, l: p.reverseLabel }]).map(opt => (
                        <option key={opt.v} value={opt.v}>{opt.l}</option>
                      ))}
                      <option value="CREATE_NEW" className="font-bold text-blue-600">+ Create new semantic pair...</option>
                    </select>
                  </div>
                )
             )}

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Temporal Bounds (Optional)</label>
                  <input type="text" placeholder="e.g. 1995~1998" value={temporalInput} onChange={(e) => setTemporalInput(e.target.value)} className="w-full p-2 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Locator / Position (Optional)</label>
                  <input type="text" placeholder="e.g. Page 42, Top-left" value={locator} onChange={(e) => setLocator(e.target.value)} className="w-full p-2 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
                </div>
             </div>

             <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <button onClick={() => setStep(targetId ? 'SEARCH' : 'FORM')} className="text-xs text-gray-500 hover:underline cursor-pointer">← Back</button>
                <button 
                  onClick={() => executeGraphMutation()} 
                  disabled={config.mode === 'SEMANTIC' && (!selectedPredicateId || isCreatingPredicate)}
                  className={`px-5 py-2 text-xs font-bold uppercase tracking-widest rounded shadow-sm disabled:opacity-50 cursor-pointer ${theme.button}`}
                >
                  Save Link
                </button>
             </div>
          </div>
        )}

        {step === 'EXECUTING' && (
          <div className="py-8 text-center animate-in fade-in flex flex-col items-center gap-3 bg-white border border-gray-200 rounded-md">
            <span className="text-3xl animate-spin text-blue-600">🌀</span>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Processing Transaction...</p>
          </div>
        )}

      </div>
    </div>
  );
}