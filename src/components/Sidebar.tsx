"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { createNode, searchGraphNodes, checkDuplicateArtifact, getUploadTicket, attachFileToNode, getExactMatchNode, restoreNode } from "@/app/actions";
import { getNodeDisplay } from "@/lib/nodeUtils";

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
    setIsDark(document.documentElement.classList.contains('dark'));
    const handleResize = () => {
      if (window.innerWidth >= 768) setIsMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  };

  // --- Search State ---
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Node[]>([]);
  const [isSearching, startSearchTransition] = useTransition();

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    startSearchTransition(async () => {
      const results = await searchGraphNodes(searchQuery.trim());
      setSearchResults(results as Node[]);
    });
  }, [searchQuery]);

  // --- Universal 4-Gateway State ---
  const [activeGateway, setActiveGateway] = useState<'IDENTITY' | 'PHYSICAL' | 'FILE' | 'URL' | null>(null);
  const [mintLabel, setMintLabel] = useState("");
  const [mintKind, setMintKind] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [payloadHash, setPayloadHash] = useState("");
  const [duplicateFound, setDuplicateFound] = useState<Node | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCloseMinting = () => {
    setActiveGateway(null);
    setMintLabel("");
    setMintKind("");
    setFile(null);
    setLinkUrl("");
    setPayloadHash("");
    setDuplicateFound(null);
  };

  const executeGlobalMint = async () => {
    if (activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') {
      if (!mintLabel.trim()) return;
      startTransition(async () => {
         const exactMatch = await getExactMatchNode(mintLabel.trim(), activeGateway);
         if (exactMatch) {
           setDuplicateFound(exactMatch as Node);
           return;
         }
         const newId = await createNode(mintLabel.trim(), activeGateway, activeGateway === 'IDENTITY' ? mintKind : null);
         handleCloseMinting();
         router.push(`/?node=${newId}`);
         setIsMobileMenuOpen(false);
      });
    } else if (activeGateway === 'FILE') {
      startTransition(async () => {
         if (file) {
           const buffer = await file.arrayBuffer();
           const hashBuf = await crypto.subtle.digest('SHA-256', buffer);
           const hex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
           
           const existing = await checkDuplicateArtifact(hex);
           if (existing) { setDuplicateFound(existing as Node); return; }

           const newId = await createNode(mintLabel.trim() || file.name, "MEDIA", null);
           const { uploadUrl, fileUrl } = await getUploadTicket(file.name, file.type);
           if (uploadUrl && uploadUrl !== 'mock') {
              await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
           }
           await attachFileToNode(newId, fileUrl, file.type, file.size, hex);
           handleCloseMinting();
           router.push(`/?node=${newId}`);
           setIsMobileMenuOpen(false);
         }
      });
    } else if (activeGateway === 'URL') {
      startTransition(async () => {
         if (linkUrl) {
           let hash = linkUrl.trim();
           const ytMatch = hash.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
           if (ytMatch && ytMatch[1]) hash = `youtube:${ytMatch[1]}`;
           
           const existing = await checkDuplicateArtifact(hash);
           if (existing) { setDuplicateFound(existing as Node); return; }

           const newId = await createNode(mintLabel.trim() || linkUrl.trim(), "MEDIA", null);
           await attachFileToNode(newId, hash.startsWith('youtube:') ? '' : linkUrl.trim(), 'text/html', 0, hash);
           handleCloseMinting();
           router.push(`/?node=${newId}`);
           setIsMobileMenuOpen(false);
         }
      });
    }
  };

  const handleRestoreFromTrash = () => {
    if (!duplicateFound) return;
    startTransition(async () => {
      await restoreNode(duplicateFound.id);
      handleCloseMinting();
      router.push(`/?node=${duplicateFound.id}`);
      setIsMobileMenuOpen(false);
    });
  };

  // --- Rendering Node Lists ---
  const displayNodes = searchQuery.trim() ? searchResults : initialNodes;
  
  const identityNodes = displayNodes.filter(n => n.layer === 'IDENTITY');
  const physicalNodes = displayNodes.filter(n => n.layer === 'PHYSICAL');
  const mediaNodes = displayNodes.filter(n => n.layer === 'MEDIA');

  const renderNodeGroup = (title: string, layerNodes: Node[]) => {
    if (layerNodes.length === 0) return null;
    return (
      <div className="mb-6">
        <h3 className="px-4 py-2 text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-1 sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md z-10 border-b border-gray-100 dark:border-zinc-800/50 shadow-sm transition-colors">
          {title}
        </h3>
        <div className="space-y-0.5 px-2">
          {layerNodes.map(node => {
            const { icon } = getNodeDisplay(node, activeKinds);
            const isActive = activeNodeId === node.id;
            const isTombstone = node.isActive === false;

            return (
              <Link
                key={node.id} 
                href={`/?node=${node.id}`}
                scroll={false}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors cursor-pointer ${
                  isActive 
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium' 
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-700 dark:text-zinc-300'
                } ${isTombstone ? 'opacity-50 grayscale' : ''}`}
              >
                <span className={`opacity-80 shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`}>{icon}</span>
                <div className="flex flex-col min-w-0">
                  <span className={`truncate ${isTombstone ? 'line-through decoration-gray-400 dark:decoration-zinc-500' : ''}`}>{node.label}</span>
                  {searchQuery.trim() && node.aliases && node.aliases.length > 0 && node.aliases.some(a => a.toLowerCase().includes(searchQuery.trim().toLowerCase())) && (
                    <span className="text-[9px] text-gray-400 dark:text-zinc-500 font-mono truncate tracking-tight">
                      ↳ {node.aliases.find(a => a.toLowerCase().includes(searchQuery.trim().toLowerCase()))}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* MOBILE HEADER */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-zinc-950 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-4 z-50 transition-colors duration-300">
        <div className="font-bold text-lg flex items-center gap-2 text-gray-900 dark:text-zinc-100">
          <span className="text-xl">📚</span> yathā
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-md cursor-pointer transition-colors"
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* SIDEBAR OVERLAY (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-gray-900/20 dark:bg-black/60 backdrop-blur-sm z-40 transition-colors"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR CONTAINER */}
      <div className={`
        fixed md:static inset-y-0 left-0 z-50
        w-72 bg-white dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col h-full shrink-0
        transform transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        {/* BRANDING (Desktop) */}
        <div className="hidden md:flex p-4 h-16 border-b border-gray-200 dark:border-zinc-800 font-bold text-lg items-center justify-between transition-colors">
          <div className="flex items-center gap-2 text-gray-900 dark:text-zinc-100">
            <span className="text-xl">📚</span> yathā
          </div>
          <button 
            onClick={toggleDarkMode}
            className="text-sm p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-zinc-400 transition-colors cursor-pointer"
            title="Toggle Theme"
          >
            {isDark ? '☀️' : '🌙'}
          </button>
        </div>

        {/* SEARCH */}
        <div className="p-4 border-b border-gray-200 dark:border-zinc-800 transition-colors bg-gray-50/50 dark:bg-zinc-950/50 pt-16 md:pt-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search archive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 pl-8 text-sm border border-gray-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors"
            />
            <span className="absolute left-2.5 top-2.5 text-gray-400 dark:text-zinc-500 text-xs">🔍</span>
            {isSearching && (
              <span className="absolute right-2.5 top-2.5 text-blue-500 text-xs animate-spin">🌀</span>
            )}
          </div>
        </div>

        {/* ENTRY GATEWAYS (4-Gateway System) */}
        {canWrite && !searchQuery.trim() && !activeGateway && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-zinc-800 bg-gray-50/30 dark:bg-zinc-900/30 transition-colors">
            <label className="block text-[10px] font-bold text-gray-500 dark:text-zinc-400 uppercase tracking-widest mb-2">Create Record</label>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setActiveGateway('IDENTITY')} className="p-2 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors cursor-pointer shadow-sm flex items-center gap-2">
                <span className="text-lg">🟣</span>
                <span className="font-bold text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300">Concept</span>
              </button>
              <button onClick={() => setActiveGateway('PHYSICAL')} className="p-2 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 text-left transition-colors cursor-pointer shadow-sm flex items-center gap-2">
                <span className="text-lg">📦</span>
                <span className="font-bold text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300">Physical</span>
              </button>
              <button onClick={() => setActiveGateway('FILE')} className="p-2 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-left transition-colors cursor-pointer shadow-sm flex items-center gap-2">
                <span className="text-lg">📄</span>
                <span className="font-bold text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300">File</span>
              </button>
              <button onClick={() => setActiveGateway('URL')} className="p-2 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded-md hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-colors cursor-pointer shadow-sm flex items-center gap-2">
                <span className="text-lg">🔗</span>
                <span className="font-bold text-[10px] uppercase tracking-widest text-gray-700 dark:text-zinc-300">Link</span>
              </button>
            </div>
          </div>
        )}

        {/* MINTING PANEL */}
        {activeGateway && (
          <div className="p-4 border-b border-gray-200 dark:border-zinc-800 bg-blue-50/50 dark:bg-blue-900/10 animate-in slide-in-from-top-2 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-800 dark:text-blue-400 flex items-center gap-1.5">
                {activeGateway === 'FILE' ? '📄 Upload File' : activeGateway === 'URL' ? '🔗 Add Web Link' : activeGateway === 'PHYSICAL' ? '📦 Mint Physical Item' : '🟣 Mint Concept'}
              </span>
              <button onClick={handleCloseMinting} className="text-gray-400 hover:text-gray-800 dark:hover:text-zinc-200 cursor-pointer">✕</button>
            </div>

            <div className="space-y-3">
              {(activeGateway === 'IDENTITY' || activeGateway === 'PHYSICAL') && (
                <>
                  <input 
                    type="text" autoFocus placeholder="Name / Label..." value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isPending}
                    className="w-full p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors"
                  />
                  {activeGateway === 'IDENTITY' && (
                    <select value={mintKind} onChange={e => setMintKind(e.target.value)} disabled={isPending} className="w-full p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors">
                      <option value="">Select Classification...</option>
                      {activeKinds.map(k => <option key={k.id} value={k.id}>{k.icon} {k.label}</option>)}
                    </select>
                  )}
                </>
              )}

              {activeGateway === 'FILE' && (
                <div className="space-y-3">
                  <input type="file" id="sidebar-file" className="hidden" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                  <label htmlFor="sidebar-file" className={`block p-4 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors ${file ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' : 'border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800'}`}>
                     <span className="block text-2xl mb-1">{file ? '✅' : '📄'}</span>
                     <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-zinc-400">{file ? file.name : 'Select File'}</span>
                  </label>
                  {file && (
                     <input type="text" autoFocus placeholder="Artifact Title..." value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isPending} className="w-full p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors" />
                  )}
                </div>
              )}

              {activeGateway === 'URL' && (
                <div className="space-y-3">
                  <input type="url" autoFocus placeholder="https://..." value={linkUrl} onChange={e => setLinkUrl(e.target.value)} disabled={isPending} className="w-full p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors" />
                  {linkUrl && (
                     <input type="text" placeholder="Artifact Title (Optional)..." value={mintLabel} onChange={e => setMintLabel(e.target.value)} disabled={isPending} className="w-full p-2 text-sm border border-blue-200 dark:border-blue-800/50 rounded-md bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm transition-colors" />
                  )}
                </div>
              )}

              {duplicateFound && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-md text-xs text-amber-800 dark:text-amber-400 shadow-sm transition-colors">
                  <strong>⚠️ Exact Match Found:</strong> "{duplicateFound.label}" already exists.
                  {duplicateFound.isActive === false && " (Currently in Trash)."}
                  <div className="mt-2 flex gap-2">
                    {duplicateFound.isActive === false ? (
                      <button onClick={handleRestoreFromTrash} disabled={isPending} className="px-3 py-1.5 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold rounded shadow-sm cursor-pointer w-full transition-colors">Restore Record</button>
                    ) : (
                      <button onClick={() => { handleCloseMinting(); router.push(`/?node=${duplicateFound.id}`); setIsMobileMenuOpen(false); }} className="px-3 py-1.5 bg-amber-600 text-white font-bold rounded shadow-sm cursor-pointer w-full transition-colors hover:bg-amber-700">View Existing</button>
                    )}
                  </div>
                </div>
              )}

              {!duplicateFound && (
                <button 
                  onClick={executeGlobalMint} 
                  disabled={isPending || (activeGateway === 'IDENTITY' && (!mintLabel || !mintKind)) || (activeGateway === 'PHYSICAL' && !mintLabel) || (activeGateway === 'FILE' && !file) || (activeGateway === 'URL' && !linkUrl)}
                  className="w-full py-2 bg-blue-600 dark:bg-blue-500 text-white text-xs font-bold uppercase tracking-widest rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 shadow-sm transition-colors cursor-pointer"
                >
                  {isPending ? "Processing..." : activeGateway === 'FILE' || activeGateway === 'URL' ? "Upload & Mint" : "Mint Record"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* DIRECTORY LISTING */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-zinc-900 transition-colors py-2">
          {searchQuery.trim() && displayNodes.length === 0 ? (
            <div className="text-center p-4 text-gray-500 dark:text-zinc-400 text-sm italic">
              No records found for "{searchQuery}".
            </div>
          ) : (
            <>
              {renderNodeGroup("Identities & Concepts", identityNodes)}
              {renderNodeGroup("Physical Items", physicalNodes)}
              {renderNodeGroup("Digital Media", mediaNodes)}
            </>
          )}
        </div>

        {/* FOOTER / USER MENU */}
        {user && (
          <div className="p-3 border-t border-gray-200 dark:border-zinc-800 bg-gray-50 dark:bg-zinc-900/80 flex items-center justify-between transition-colors">
            <div className="flex items-center gap-2 overflow-hidden">
              {user.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={user.image} alt="User" className="w-6 h-6 rounded-full object-cover shadow-sm" />
              ) : (
                <div className="w-6 h-6 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm">
                  {(user.name || user.email || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-gray-900 dark:text-zinc-100 truncate">{user.name || user.email}</span>
                <span className="text-[9px] text-gray-500 dark:text-zinc-400 font-mono uppercase tracking-widest truncate">{user.role}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {user.role === 'SUPERUSER' && (
                <>
                  <Link 
                    href="/dictionary" 
                    className="text-base text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-md"
                    title="Taxonomy Dictionary"
                  >
                    📖
                  </Link>
                  <Link 
                    href="/admin" 
                    className="text-base text-gray-400 dark:text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer p-1 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded-md"
                    title="Admin Settings"
                  >
                    ⚙️
                  </Link>
                </>
              )}
              <button 
                onClick={() => signOut()} 
                className="text-base text-gray-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                title="Sign Out"
              >
                🚪
              </button>
            </div>
          </div>
        )}

        {licenseeName && (
          <div className="py-2 border-t border-gray-200 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50 text-[9px] text-gray-400 dark:text-zinc-500 font-mono tracking-widest uppercase text-center transition-colors">
            License: {licenseeName}
          </div>
        )}
      </div>
    </>
  );
}