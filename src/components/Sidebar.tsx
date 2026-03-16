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

  // --- Mobile Menu & Dark Mode State ---
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  // Initialize Dark Mode on mount & Add Resize Listener
  useEffect(() => {
    if (document.documentElement.classList.contains('dark')) {
      setIsDark(true);
    }

    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false); // Auto-close menu on desktop
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleDarkMode = () => {
    if (isDark) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDark(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDark(true);
    }
  };

  // --- Search State ---
  const [searchTerm, setSearchTerm] = useState("");
  const [searchedNodes, setSearchedNodes] = useState<Node[] | null>(null);
  const [isSearching, startTransitionSearch] = useTransition();

  // --- Minting / Upload State ---
  const [isMinting, setIsMinting] = useState(false);
  const [mintTrack, setMintTrack] = useState<'FORM' | 'PAYLOAD' | null>(null);
  const [mintLabel, setMintLabel] = useState("");
  const [mintLayer, setMintLayer] = useState<"IDENTITY" | "PHYSICAL" | "">("");
  const [mintKind, setMintKind] = useState("");
  
  const [file, setFile] = useState<File | null>(null);
  const [payloadHash, setPayloadHash] = useState("");
  const [isPending, startTransitionSubmit] = useTransition();
  const [uploadStatus, setUploadStatus] = useState("");

  const [duplicateFound, setDuplicateFound] = useState<Node | null>(null);

  useEffect(() => {
    if (searchTerm.trim().length === 0) {
      setSearchedNodes(null);
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      startTransitionSearch(async () => {
        const results = await searchGraphNodes(searchTerm.trim());
        setSearchedNodes(results as Node[]);
      });
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  const resetMinting = () => {
    setIsMinting(false);
    setMintTrack(null);
    setMintLabel("");
    setMintLayer("");
    setMintKind("");
    setFile(null);
    setPayloadHash("");
    setDuplicateFound(null);
    setUploadStatus("");
  };

  const handleLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  // --- Track 1: Form (Identity/Physical) ---
  const handleMintForm = async () => {
    if (!mintLabel.trim() || !mintLayer) return;
    if (mintLayer === 'IDENTITY' && !mintKind) return;

    setUploadStatus("Checking records...");
    
    // Soft Dedupe Check
    const exactMatch = await getExactMatchNode(mintLabel.trim(), mintLayer as any);
    if (exactMatch) {
      setDuplicateFound(exactMatch as Node);
      setUploadStatus("");
      return;
    }

    startTransitionSubmit(async () => {
      const newId = await createNode(mintLabel.trim(), mintLayer as "IDENTITY" | "PHYSICAL", mintLayer === 'IDENTITY' ? mintKind : null);
      router.push(`/?node=${newId}`);
      resetMinting();
      setIsMobileMenuOpen(false);
    });
  };

  // --- Track 2: Payload (Media) ---
  const analyzeFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setUploadStatus("Hashing payload...");

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setPayloadHash(hashHex);

      setUploadStatus("Checking for duplicates...");
      const existing = await checkDuplicateArtifact(hashHex);
      if (existing) {
        setDuplicateFound(existing as Node);
        setUploadStatus("");
        return;
      }

      setMintLabel(selectedFile.name);
      setUploadStatus("");
    } catch (e) {
      setUploadStatus("Analysis failed.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      e.target.value = '';
      analyzeFile(selected);
    }
  };

  const handleMintPayload = async () => {
    if (!file || !payloadHash || !mintLabel.trim()) return;

    startTransitionSubmit(async () => {
      try {
        setUploadStatus("Minting record...");
        const newId = await createNode(mintLabel.trim(), "MEDIA", null);

        setUploadStatus("Requesting secure upload ticket...");
        const { uploadUrl, fileUrl } = await getUploadTicket(file.name, file.type);
        
        if (uploadUrl && uploadUrl !== 'mock-url') {
           setUploadStatus("Uploading securely to R2...");
           const uploadResponse = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
           if (!uploadResponse.ok) throw new Error("Storage rejected the file.");
        }

        setUploadStatus("Finalizing graph properties...");
        await attachFileToNode(newId, fileUrl || payloadHash, file.type, file.size, payloadHash);
        
        router.push(`/?node=${newId}`);
        resetMinting();
        setIsMobileMenuOpen(false);
      } catch (error) {
        console.error(error);
        setUploadStatus("Upload failed.");
      }
    });
  };

  const handleRestoreFromTrash = () => {
    if (!duplicateFound) return;
    startTransitionSubmit(async () => {
      await restoreNode(duplicateFound.id);
      router.push(`/?node=${duplicateFound.id}`);
      resetMinting();
      setIsMobileMenuOpen(false);
    });
  };

  const displayNodes = searchedNodes || initialNodes;

  return (
    <>
      {/* MOBILE HEADER (Hamburger Menu) */}
      <div className="md:hidden fixed top-0 left-0 w-full bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 z-50 px-4 py-3 flex items-center justify-between shadow-sm transition-colors duration-300">
        <div className="flex items-center gap-2">
          <span className="text-xl">📚</span>
          <h1 className="font-serif font-bold text-xl tracking-tight text-gray-900 dark:text-zinc-100">yathā</h1>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-600 dark:text-zinc-400 focus:outline-none cursor-pointer">
          <span className="text-xl leading-none">{isMobileMenuOpen ? "✕" : "☰"}</span>
        </button>
      </div>

      {/* MOBILE OVERLAY */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-gray-900/50 dark:bg-black/80 backdrop-blur-sm transition-colors duration-300" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR CONTAINER */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col flex-shrink-0 transform transition-all duration-300 ease-in-out md:relative md:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        <div className="hidden md:flex p-4 pb-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📚</span>
            <h1 className="font-serif font-bold text-xl tracking-tight text-gray-900 dark:text-zinc-100">
              yathā
            </h1>
          </div>
          
          {/* Dark Mode Toggle */}
          <button 
            onClick={toggleDarkMode} 
            className="text-gray-400 hover:text-gray-900 dark:text-zinc-500 dark:hover:text-zinc-100 transition-colors p-1 cursor-pointer"
            title="Toggle Dark Mode"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="px-4 pb-4 pt-4 md:pt-0">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search graph..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2 pl-8 text-sm bg-gray-100 dark:bg-zinc-800/50 border border-transparent dark:border-zinc-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-zinc-100 placeholder-gray-500 dark:placeholder-zinc-500 transition-colors"
            />
            <span className="absolute left-2.5 top-2.5 text-gray-400 dark:text-zinc-500 text-sm">
              {isSearching ? '⏳' : '🔍'}
            </span>
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {canWrite && !isMinting && (
          <div className="px-4 pb-4 flex gap-2">
            <button 
              onClick={() => { setIsMinting(true); setMintTrack('FORM'); }}
              className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors shadow-sm cursor-pointer"
            >
              + Mint Record
            </button>
            <button 
              onClick={() => { setIsMinting(true); setMintTrack('PAYLOAD'); }}
              className="flex-1 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors shadow-sm cursor-pointer"
            >
              ☁️ Upload File
            </button>
          </div>
        )}

        {isMinting && (
          <div className="mx-4 mb-4 p-4 border border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg shadow-inner animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-800 dark:text-blue-400">
                {mintTrack === 'FORM' ? '✨ Mint New Record' : '☁️ Upload Media'}
              </span>
              <button onClick={resetMinting} disabled={isPending} className="text-gray-400 hover:text-gray-800 dark:hover:text-zinc-300 cursor-pointer px-1">✕</button>
            </div>

            {duplicateFound ? (
              <div className={`p-3 rounded border mb-3 ${duplicateFound.isActive === false ? 'bg-gray-100 dark:bg-zinc-800 border-gray-300 dark:border-zinc-700' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50'}`}>
                {duplicateFound.isActive === false ? (
                  <>
                    <p className="text-xs font-bold text-gray-800 dark:text-zinc-200 mb-1 flex items-center gap-1"><span>🗑️</span> Found in Trash</p>
                    <p className="text-[10px] text-gray-600 dark:text-zinc-400 mb-3 leading-tight">This {mintTrack === 'PAYLOAD' ? 'exact payload' : 'name'} exists, but was moved to the trash.</p>
                    <button onClick={handleRestoreFromTrash} disabled={isPending} className="w-full py-1.5 bg-gray-800 dark:bg-zinc-700 text-white text-xs font-bold rounded hover:bg-gray-900 dark:hover:bg-zinc-600 cursor-pointer shadow-sm transition-colors">
                      {isPending ? "..." : "Restore & Use"}
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1"><span>⚠️</span> Conflict</p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-500 mb-3 leading-tight">This {mintTrack === 'PAYLOAD' ? 'exact payload' : 'name'} already exists in the archive.</p>
                    <div className="flex gap-2">
                      <Link scroll={false} href={`/?node=${duplicateFound.id}`} onClick={resetMinting} className="flex-1 py-1.5 text-center bg-amber-600 text-white text-xs font-bold rounded shadow-sm hover:bg-amber-700 cursor-pointer">View</Link>
                      {mintTrack === 'FORM' && (
                        <button onClick={handleMintForm} className="flex-1 py-1.5 bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/50 text-xs font-bold rounded shadow-sm hover:bg-amber-50 dark:hover:bg-amber-900/30 cursor-pointer">Mint Dup</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : mintTrack === 'FORM' ? (
              <div className="space-y-3">
                <input 
                  type="text" 
                  placeholder="Name of record..." 
                  value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isPending}
                  className="w-full p-2 text-xs border border-gray-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100"
                />
                <select 
                  value={mintLayer} onChange={e => { setMintLayer(e.target.value as any); setMintKind(""); }} disabled={isPending}
                  className="w-full p-2 text-xs border border-gray-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100"
                >
                  <option value="">Select Layer...</option>
                  <option value="IDENTITY">Abstract Concept</option>
                  <option value="PHYSICAL">Physical Item</option>
                </select>
                {mintLayer === 'IDENTITY' && (
                  <select 
                    value={mintKind} onChange={e => setMintKind(e.target.value)} disabled={isPending}
                    className="w-full p-2 text-xs border border-gray-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100"
                  >
                    <option value="">Select Classification...</option>
                    {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                  </select>
                )}
                
                <button 
                  onClick={handleMintForm} disabled={isPending || !mintLabel.trim() || !mintLayer || (mintLayer === 'IDENTITY' && !mintKind)}
                  className="w-full py-2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isPending ? "Minting..." : "Create"}
                </button>
                {uploadStatus && <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold animate-pulse text-center">{uploadStatus}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <input type="file" className="hidden" id="sb-file" onChange={handleFileSelect} disabled={isPending} />
                <label htmlFor="sb-file" className="block p-4 rounded-lg border-2 border-dashed border-blue-200 dark:border-blue-800/50 text-center transition-colors cursor-pointer bg-white dark:bg-zinc-900 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                  <span className="text-xl mb-1 block">{file ? '✅' : '📄'}</span>
                  <span className="text-[10px] text-gray-600 dark:text-zinc-400 font-medium truncate px-2 block">{file ? file.name : 'Click to select file'}</span>
                </label>
                {file && !duplicateFound && (
                   <input 
                     type="text" 
                     placeholder="Artifact Title..." 
                     value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isPending}
                     className="w-full p-2 text-xs border border-gray-200 dark:border-zinc-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100"
                   />
                )}
                {file && !duplicateFound && (
                  <button 
                    onClick={handleMintPayload} disabled={isPending || !payloadHash || !mintLabel.trim()}
                    className="w-full py-2 bg-blue-600 text-white text-xs font-bold uppercase tracking-widest rounded shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isPending ? "Processing..." : "Upload"}
                  </button>
                )}
                {uploadStatus && <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold animate-pulse text-center">{uploadStatus}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-6">
          {['IDENTITY', 'PHYSICAL', 'MEDIA'].map(layer => {
            const layerNodes = displayNodes.filter(n => n.layer === layer);
            if (layerNodes.length === 0) return null;
            
            const title = layer === 'IDENTITY' ? 'Abstract Concepts' : layer === 'PHYSICAL' ? 'Physical Holdings' : 'Digital Media';

            return (
              <div key={layer}>
                <h3 className="px-2 text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase tracking-widest mb-2 sticky top-0 bg-white dark:bg-zinc-900 py-1 z-10">
                  {title}
                </h3>
                <div className="space-y-0.5">
                  {layerNodes.map(node => {
                    let icon = '🟣';
                    if (layer === 'PHYSICAL') icon = '📦';
                    else if (layer === 'MEDIA') icon = getMediaDetails(node.properties).icon;
                    else {
                      const kindDef = activeKinds.find(k => k.id === node.kind);
                      if (kindDef) icon = kindDef.icon;
                    }

                    const isActive = activeNodeId === node.id;
                    const isTombstone = node.isActive === false;

                    return (
                      <Link
                        key={node.id}
                        href={`/?node=${node.id}`}
                        scroll={false}
                        onClick={handleLinkClick}
                        className={`w-full text-left px-2 py-1.5 rounded-md text-sm flex items-center gap-2 transition-all ${
                          isActive 
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-medium' 
                            : 'text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100'
                        } ${isTombstone && !isActive ? 'opacity-50 grayscale' : ''}`}
                      >
                        <span className="text-xs shrink-0">{icon}</span>
                        <span className={`truncate flex-1 ${isTombstone ? 'line-through decoration-gray-400 dark:decoration-zinc-500' : ''}`}>
                          {node.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
          
          {displayNodes.length === 0 && (
             <div className="p-4 text-center text-gray-400 dark:text-zinc-500 text-xs italic">
               No records found.
             </div>
          )}
        </div>

        {/* CURRENT USER & AUTH / SETTINGS */}
        {user && (
          <div className="p-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
               {user.image || user.avatar ? (
                 /* eslint-disable-next-line @next/next/no-img-element */
                 <img src={user.image || user.avatar} alt={user.name || "User"} className="w-7 h-7 rounded-full shadow-sm object-cover" />
               ) : (
                 <div className="w-7 h-7 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-bold shadow-sm shrink-0 border border-blue-200 dark:border-blue-800">
                   {user.name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                 </div>
               )}
               <div className="flex flex-col min-w-0">
                 <span className="text-[10px] font-bold text-gray-900 dark:text-zinc-100 truncate leading-tight">{user.name || user.email}</span>
                 <span className="text-[9px] text-gray-500 dark:text-zinc-400 uppercase tracking-wider truncate leading-tight">{user.role || 'System User'}</span>
               </div>
            </div>
            
            <div className="flex items-center">
              {user.role === 'SUPERUSER' && (
                <>
                  <Link 
                    href="/dictionary" 
                    className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer px-2"
                    title="Taxonomy Dictionary"
                  >
                    📖
                  </Link>
                  <Link 
                    href="/admin" 
                    className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer px-2"
                    title="Admin Settings"
                  >
                    ⚙️
                  </Link>
                </>
              )}
              <button 
                onClick={() => signOut()} 
                className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors uppercase tracking-widest cursor-pointer px-2"
                title="Sign Out"
              >
                Exit
              </button>
            </div>
          </div>
        )}

        {licenseeName && (
          <div className="py-2 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 text-[9px] text-gray-400 dark:text-zinc-500 font-mono uppercase tracking-widest text-center leading-relaxed">
            Licensed Archive:<br/>
            <span className="font-bold text-gray-500 dark:text-zinc-400">{licenseeName}</span>
          </div>
        )}
      </div>
    </>
  );
}