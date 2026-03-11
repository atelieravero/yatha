"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { createNode, searchGraphNodes, checkDuplicateArtifact, getUploadTicket, attachFileToNode, getExactMatchNode, restoreNode } from "@/app/actions";
import { getMediaDetails } from "@/lib/mediaUtils";

type Node = {
  id: string;
  label: string;
  layer: "IDENTITY" | "PHYSICAL" | "MEDIA";
  kind?: string | null; 
  aliases?: string[];
  properties?: Record<string, any>;
  isActive?: boolean;
};

type Kind = { id: string; label: string; icon: string; };

export default function Sidebar({ 
  initialNodes = [],
  activeKinds = [],
  user = null,
  licenseeName = ""
}: { 
  initialNodes?: Node[];
  activeKinds?: Kind[];
  user?: any;
  licenseeName?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeNodeId = searchParams.get("node");
  
  // Is the user allowed to edit?
  const canWrite = user?.role === 'SUPERUSER' || user?.role === 'ARCHIVIST';

  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [searchedNodes, setSearchedNodes] = useState<Node[] | null>(null);
  const [isSearching, startTransitionSearch] = useTransition();

  // --- 4-Gateway Creation State ---
  const [isMinting, setIsMinting] = useState(false);
  const [step, setStep] = useState<'GATEWAY' | 'FORM'>('GATEWAY');
  const [activeGateway, setActiveGateway] = useState<'IDENTITY' | 'PHYSICAL' | 'FILE' | 'URL' | null>(null);
  const [isSubmitting, startTransitionSubmit] = useTransition();

  const [mintLabel, setMintLabel] = useState("");
  const [mintKind, setMintKind] = useState(""); 
  const [file, setFile] = useState<File | null>(null);
  const [payloadHash, setPayloadHash] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [duplicateFound, setDuplicateFound] = useState<any | null>(null);

  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      startTransitionSearch(async () => {
        const results = await searchGraphNodes(searchTerm.trim());
        setSearchedNodes(results as Node[]);
      });
    } else {
      setSearchedNodes(null);
    }
  }, [searchTerm]);

  const displayNodes = searchedNodes !== null ? searchedNodes : (initialNodes || []);

  const filteredNodes = displayNodes.filter((n) =>
    n.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (n.kind && n.kind.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (n.aliases && n.aliases.some(alias => alias.toLowerCase().includes(searchTerm.toLowerCase())))
  );

  // ============================================================================
  // STRICT 3-LAYER UI GROUPING
  // ============================================================================
  const identitiesByKind = filteredNodes
    .filter((n) => n.layer === "IDENTITY")
    .reduce((acc, node) => {
      const k = node.kind || 'Unclassified';
      if (!acc[k]) acc[k] = [];
      acc[k].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

  const physicalNodes = filteredNodes.filter((n) => n.layer === "PHYSICAL");
  
  const mediaByFormat = filteredNodes
    .filter((n) => n.layer === "MEDIA")
    .reduce((acc, node) => {
      const { format, icon } = getMediaDetails(node.properties);
      if (!acc[format]) acc[format] = { icon, nodes: [] };
      acc[format].nodes.push(node);
      return acc;
    }, {} as Record<string, { icon: string, nodes: Node[] }>);

  const getKindDisplay = (kindId: string) => {
    const kindDef = activeKinds?.find(k => k.id === kindId || k.label === kindId);
    if (kindDef) return { label: kindDef.label, icon: kindDef.icon };
    return { label: kindId || 'Unclassified', icon: '🟣' };
  };

  // ============================================================================
  // GLOBAL MINTING HANDLERS
  // ============================================================================
  const resetMinting = () => {
    setIsMinting(false);
    setStep('GATEWAY');
    setActiveGateway(null);
    setMintLabel("");
    setMintKind("");
    setFile(null);
    setPayloadHash("");
    setDuplicateFound(null);
    setIsDragging(false);
  };

  const handleGatewaySelect = (gateway: 'IDENTITY' | 'PHYSICAL' | 'FILE' | 'URL') => {
    setActiveGateway(gateway);
    setStep('FORM');
  };

  // Drag & Drop Handlers for File Gateway
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDropForm = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) { setFile(droppedFile); setMintLabel(droppedFile.name); }
  };

  const processFormSubmit = async () => {
    if (!activeGateway || !canWrite) return;

    if (activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') {
      const exactMatch = await getExactMatchNode(mintLabel, activeGateway);
      if (exactMatch) {
        setDuplicateFound(exactMatch);
        return; 
      }
      executeGlobalMint();
    } 
    else if (activeGateway === 'FILE' || activeGateway === 'URL') {
      if (activeGateway === 'FILE' && file) {
        const buffer = await file.arrayBuffer();
        const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
        const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
        setPayloadHash(hex);
        
        const existing = await checkDuplicateArtifact(hex);
        if (existing) { setDuplicateFound(existing); return; }
      } else if (activeGateway === 'URL') {
        let hash = mintLabel.trim();
        const ytMatch = hash.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch && ytMatch[1]) hash = `youtube:${ytMatch[1]}`;
        
        setPayloadHash(hash);
        const existing = await checkDuplicateArtifact(hash);
        if (existing) { setDuplicateFound(existing); return; }
      }
      executeGlobalMint();
    }
  };

  const executeGlobalMint = () => {
    startTransitionSubmit(async () => {
      let finalTargetId = ""; 

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

      resetMinting();
      if (finalTargetId) router.push(`/?node=${finalTargetId}`);
    });
  };

  const handleRestoreFromTrash = () => {
    if (!duplicateFound || !canWrite) return;
    startTransitionSubmit(async () => {
      await restoreNode(duplicateFound.id);
      router.push(`/?node=${duplicateFound.id}`);
      resetMinting();
    });
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 h-screen flex flex-col flex-shrink-0 z-10 relative">
      
      <div className="p-4 pb-3 flex items-center gap-2">
        <span className="text-xl">📚</span>
        <h1 className="font-serif font-bold text-xl tracking-tight text-gray-900">
          yathā
        </h1>
      </div>

      <div className="px-4 pb-4">
        <div className="relative">
          <span className="absolute left-3 top-2 text-gray-400 text-sm">
            {isSearching ? "⏳" : "🔍"}
          </span>
          <input
            type="text"
            placeholder="Search database..."
            className="w-full pl-9 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* GLOBAL MINTING BUTTON (Hidden for Viewers) */}
      {canWrite && (
        <div className="px-4 pb-4 border-b border-gray-100 flex">
          <button 
            onClick={() => { setIsMinting(true); setStep('GATEWAY'); }}
            className="flex-1 flex flex-col items-center justify-center py-2 bg-gray-900 text-white rounded shadow-sm hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <span className="text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 flex items-center gap-1"><span className="text-sm leading-none">+</span> Add to Archive</span>
          </button>
        </div>
      )}

      {/* 4-GATEWAY GLOBAL MINTING PANEL */}
      {isMinting && canWrite && (
        <div className="p-4 border-b border-gray-200 bg-gray-50/80 animate-in fade-in slide-in-from-top-2 relative shadow-inner">
          <div className="flex justify-between items-center mb-3">
            <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
              {step === 'GATEWAY' ? "✨ Select Format" : "✨ Mint New Record"}
            </label>
            <button onClick={resetMinting} disabled={isSubmitting} className="text-gray-400 hover:text-gray-900 cursor-pointer">✕</button>
          </div>

          {step === 'GATEWAY' && (
            <div className="animate-in slide-in-from-right-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleGatewaySelect('IDENTITY')} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors cursor-pointer shadow-sm">
                  <span className="block text-xl mb-1">🟣</span>
                  <span className="font-bold text-xs text-gray-900 block">Concept</span>
                  <span className="text-[9px] text-gray-500">People, Works</span>
                </button>
                <button onClick={() => handleGatewaySelect('PHYSICAL')} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-amber-300 hover:bg-amber-50 text-left transition-colors cursor-pointer shadow-sm">
                  <span className="block text-xl mb-1">📦</span>
                  <span className="font-bold text-xs text-gray-900 block">Physical</span>
                  <span className="text-[9px] text-gray-500">Tangible Items</span>
                </button>
                <button onClick={() => handleGatewaySelect('FILE')} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-emerald-300 hover:bg-emerald-50 text-left transition-colors cursor-pointer shadow-sm">
                  <span className="block text-xl mb-1">📄</span>
                  <span className="font-bold text-xs text-gray-900 block">Upload</span>
                  <span className="text-[9px] text-gray-500">Files, Media</span>
                </button>
                <button onClick={() => handleGatewaySelect('URL')} className="p-3 border border-gray-200 bg-white rounded-lg hover:border-blue-300 hover:bg-blue-50 text-left transition-colors cursor-pointer shadow-sm">
                  <span className="block text-xl mb-1">🔗</span>
                  <span className="font-bold text-xs text-gray-900 block">Web URL</span>
                  <span className="text-[9px] text-gray-500">External Links</span>
                </button>
              </div>
            </div>
          )}

          {step === 'FORM' && activeGateway && (
            <div className="animate-in slide-in-from-right-2">
              
              {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                <div className="space-y-2 mb-3">
                  <input type="text" autoFocus placeholder="Name / Primary Label..." value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isSubmitting} className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm" />
                  {activeGateway === 'IDENTITY' && (
                    <select value={mintKind} onChange={e => setMintKind(e.target.value)} disabled={isSubmitting} className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 bg-white shadow-sm outline-none">
                      <option value="">Select Classification...</option>
                      {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                    </select>
                  )}
                </div>
              )}

              {activeGateway === 'FILE' && (
                <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDropForm} className="mb-3">
                  <input type="file" className="hidden" id="sb-file" onChange={e => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setMintLabel(e.target.files[0].name); } }} />
                  <label htmlFor="sb-file" className={`block p-4 rounded-md border-2 border-dashed text-center transition-colors cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'}`}>
                    <span className="text-xl mb-1 block">{file ? '✅' : isDragging ? '📥' : '📄'}</span>
                    <span className="text-[10px] text-gray-600 font-medium">{file ? file.name : 'Click or drop file here'}</span>
                  </label>
                  {file && (
                    <input type="text" placeholder="Artifact Title..." value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isSubmitting} className="w-full p-2 mt-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white shadow-sm" />
                  )}
                </div>
              )}

              {activeGateway === 'URL' && (
                <div className="mb-3">
                  <input type="url" autoFocus placeholder="https://" value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isSubmitting} className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 mb-1 outline-none bg-white shadow-sm" />
                  <p className="text-[9px] text-gray-400 font-medium">YouTube URLs convert into iframes.</p>
                </div>
              )}

              {/* TRASH-AWARE DEDUPLICATION WARNING */}
              {duplicateFound && (
                <div className={`p-2 mb-3 border rounded-md ${duplicateFound.isActive === false ? 'bg-gray-100 border-gray-300' : 'bg-amber-50 border-amber-200'}`}>
                  {duplicateFound.isActive === false ? (
                    <>
                      <p className="text-[10px] font-bold text-gray-800 mb-0.5 flex items-center gap-1"><span>🗑️</span> Found in Trash</p>
                      <p className="text-[9px] text-gray-600 mb-2">"{duplicateFound.label}" exists, but it was moved to the trash.</p>
                      <button onClick={handleRestoreFromTrash} disabled={isSubmitting} className="w-full py-1 bg-gray-800 text-white text-[10px] font-bold rounded hover:bg-gray-900 cursor-pointer shadow-sm">
                        {isSubmitting ? "..." : "Restore Record"}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-[10px] font-bold text-amber-800 mb-0.5 flex items-center gap-1"><span>⚠️</span> Exact Match Found</p>
                      <p className="text-[9px] text-amber-700 mb-2">
                        "{duplicateFound.label}"
                        {duplicateFound.aliases && duplicateFound.aliases.length > 0 && (
                          <span className="opacity-80"> ({duplicateFound.aliases.join(', ')})</span>
                        )} exists.
                      </p>
                      <div className="flex gap-1">
                        <button onClick={() => { router.push(`/?node=${duplicateFound.id}`); resetMinting(); }} className="flex-1 py-1 bg-amber-600 text-white text-[10px] font-bold rounded hover:bg-amber-700 cursor-pointer">Go to Record</button>
                        {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                          <button onClick={executeGlobalMint} className="flex-1 py-1 bg-white text-amber-700 border border-amber-200 text-[10px] font-bold rounded hover:bg-amber-100 cursor-pointer">Mint Duplicate</button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <button onClick={() => setStep('GATEWAY')} disabled={isSubmitting} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">← Back</button>
                {!duplicateFound && (
                  <button 
                    onClick={processFormSubmit} 
                    disabled={isSubmitting || (activeGateway === 'IDENTITY' && (!mintLabel || !mintKind)) || (activeGateway === 'PHYSICAL' && !mintLabel) || (activeGateway === 'FILE' && !file) || (activeGateway === 'URL' && !mintLabel)}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? "..." : "Mint Record"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GRAPH NAVIGATION */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        
        {/* 1. IDENTITIES */}
        <div>
          <h2 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded w-fit mb-4">
            Identities
          </h2>
          {Object.entries(identitiesByKind).map(([kindId, nodes]) => {
            const { label, icon } = getKindDisplay(kindId);
            return (
              <div key={kindId} className="mb-4">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                  <span className="text-xs opacity-80">{icon}</span> {label}
                </h3>
                <ul className="space-y-0.5">
                  {nodes.map((node) => (
                    <li key={node.id}>
                      <Link scroll={false} href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                        <span className="truncate block">
                          {node.label}
                          {node.aliases && node.aliases.length > 0 && <span className="text-gray-400 font-normal ml-1.5 text-[10px]">({node.aliases.join(', ')})</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {Object.keys(identitiesByKind).length === 0 && <p className="text-xs text-gray-400 italic px-2">No identities found.</p>}
        </div>

        {/* 2. PHYSICAL ITEMS */}
        <div className="pt-4 border-t border-gray-100">
          <h2 className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded w-fit mb-4">
            Physical Items
          </h2>
          <ul className="space-y-0.5">
            {physicalNodes.map((node) => (
              <li key={node.id}>
                <Link scroll={false} href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-emerald-50 text-emerald-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                  <span className="truncate block">
                    <span className="opacity-80 mr-1">📦</span> {node.label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {physicalNodes.length === 0 && <p className="text-xs text-gray-400 italic px-2">No physical items found.</p>}
        </div>

        {/* 3. DIGITAL MEDIA */}
        <div className="pt-4 border-t border-gray-100">
          <h2 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded w-fit mb-4">
            Digital Media
          </h2>
          {Object.entries(mediaByFormat).map(([format, { icon, nodes }]) => (
            <div key={format} className="mb-4">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                <span className="text-xs opacity-80">{icon}</span> {format}
              </h3>
              <ul className="space-y-0.5">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <Link scroll={false} href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-amber-50 text-amber-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                      <span className="truncate block">
                        {node.label}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Object.keys(mediaByFormat).length === 0 && <p className="text-xs text-gray-400 italic px-2">No media found.</p>}
        </div>
      </div>

      {/* FOOTER (Settings, User Profile, License) */}
      <div className="p-4 border-t border-gray-200 bg-gray-50/80 mt-auto flex-shrink-0 flex flex-col gap-3">
        
        {canWrite && (
           <Link scroll={false} href="/dictionary" className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 uppercase tracking-widest transition-colors cursor-pointer">
             <span className="text-sm">⚙️</span> Manage Taxonomy
           </Link>
        )}
        
        {user?.role === 'SUPERUSER' && (
          <Link scroll={false} href="/admin" className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors cursor-pointer">
            <span className="text-sm">👥</span> Manage Users
          </Link>
        )}

        {user && (
          <div className="pt-3 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
               {user.image || user.avatar ? (
                 /* eslint-disable-next-line @next/next/no-img-element */
                 <img src={user.image || user.avatar} alt={user.name || "User"} className="w-7 h-7 rounded-full shadow-sm object-cover" />
               ) : (
                 <div className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold shadow-sm shrink-0">
                   {user.name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                 </div>
               )}
               <div className="flex flex-col min-w-0">
                 <span className="text-[10px] font-bold text-gray-900 truncate leading-tight">{user.name || user.email}</span>
                 <span className="text-[9px] text-gray-500 uppercase tracking-wider truncate leading-tight">{user.role || 'System User'}</span>
               </div>
            </div>
            <button 
              onClick={() => signOut()} 
              className="text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors uppercase tracking-widest cursor-pointer px-2"
              title="Sign Out"
            >
              Exit
            </button>
          </div>
        )}

        {licenseeName && (
          <div className="mt-1 pt-3 border-t border-gray-200 text-[9px] text-gray-400 font-mono uppercase tracking-widest text-center leading-relaxed">
            Licensed Archive:<br/>
            <span className="font-bold text-gray-500">{licenseeName}</span>
          </div>
        )}
      </div>

    </div>
  );
}