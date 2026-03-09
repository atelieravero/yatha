"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import MediaUploader from "@/components/MediaUploader";
import { createNode, searchGraphNodes } from "@/app/actions";

type Node = {
  id: string;
  label: string;
  layer: "IDENTITY" | "PHYSICAL" | "MEDIA";
  kind?: string | null; 
  aliases?: string[];
  properties?: Record<string, any>;
};

type Kind = {
  id: string;
  label: string;
  icon: string;
};

export default function Sidebar({ 
  initialNodes = [],
  activeKinds = [] 
}: { 
  initialNodes?: Node[];
  activeKinds?: Kind[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeNodeId = searchParams.get("node");

  const [searchTerm, setSearchTerm] = useState("");
  const [searchedNodes, setSearchedNodes] = useState<Node[] | null>(null);
  const [isSearching, startTransition] = useTransition();

  // Two-Track Creation State
  const [isMintingTrack1, setIsMintingTrack1] = useState(false);
  const [isUploadingTrack2, setIsUploadingTrack2] = useState(false);
  
  const [newLabel, setNewLabel] = useState("");
  const [newKindLayer, setNewKindLayer] = useState(""); // Format: "LAYER|KIND"
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      startTransition(async () => {
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
  
  // Media grouping by Mime Type prefix
  const mediaByFormat = filteredNodes
    .filter((n) => n.layer === "MEDIA")
    .reduce((acc, node) => {
      let format = 'Document';
      const mime = node.properties?.mimeType || '';
      if (mime.startsWith('image/')) format = 'Image';
      else if (mime.startsWith('video/')) format = 'Video';
      else if (mime.startsWith('audio/')) format = 'Audio';
      else if (node.properties?.url) format = 'Web Link';
      else if (node.properties?.youtube_id) format = 'YouTube';

      if (!acc[format]) acc[format] = [];
      acc[format].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

  const getKindDisplay = (kindId: string) => {
    const kindDef = activeKinds?.find(k => k.id === kindId || k.label === kindId);
    if (kindDef) return { label: kindDef.label, icon: kindDef.icon };
    return { label: kindId || 'Unclassified', icon: '🟣' };
  };

  const getMediaIcon = (format: string) => {
    const icons: Record<string, string> = { 'Image': '🖼️', 'Video': '🎞️', 'Audio': '🎵', 'Web Link': '🔗', 'YouTube': '📺' };
    return icons[format] || '📄';
  };

  const handleTrack1Submit = async () => {
    if (!newLabel.trim() || !newKindLayer) return;
    try {
      setIsSubmitting(true);
      const [layer, kind] = newKindLayer.split('|');
      
      // If PHYSICAL, kind is passed as null to the DB.
      const parsedKind = kind === "null" ? null : kind;
      const newId = await createNode(newLabel.trim(), layer as any, parsedKind);
      
      setIsMintingTrack1(false);
      setNewLabel("");
      setNewKindLayer("");
      router.push(`/?node=${newId}`);
    } catch (error) {
      console.error("Failed to create node:", error);
    } finally {
      setIsSubmitting(false);
    }
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

      <div className="px-4 pb-4 border-b border-gray-100 flex gap-2">
        <button 
          onClick={() => { setIsMintingTrack1(true); setIsUploadingTrack2(false); }}
          className="flex-1 flex flex-col items-center justify-center py-2 bg-gray-900 text-white rounded shadow-sm hover:bg-gray-800 transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 flex items-center gap-1"><span className="text-sm leading-none">+</span> Mint</span>
          <span className="text-[9px] text-gray-400 font-medium">Concept / Item</span>
        </button>
        <button 
          onClick={() => { setIsUploadingTrack2(true); setIsMintingTrack1(false); }}
          className="flex-1 flex flex-col items-center justify-center py-2 bg-white border border-gray-200 text-gray-700 rounded shadow-sm hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <span className="text-[10px] font-bold uppercase tracking-widest leading-none mb-0.5 flex items-center gap-1"><span className="text-sm leading-none">☁️</span> Upload</span>
          <span className="text-[9px] text-gray-500 font-medium">Media / Link</span>
        </button>
      </div>

      {isMintingTrack1 && (
        <div className="p-4 border-b border-gray-200 bg-blue-50/30 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center mb-3">
            <label className="text-[10px] font-bold text-blue-800 uppercase tracking-widest">✨ Mint New Record</label>
            <button onClick={() => setIsMintingTrack1(false)} className="text-gray-400 hover:text-gray-900 cursor-pointer">✕</button>
          </div>
          
          <input 
            autoFocus
            type="text" 
            placeholder="Name / Title..." 
            value={newLabel} 
            onChange={e => setNewLabel(e.target.value)} 
            disabled={isSubmitting}
            className="w-full text-sm p-2 border border-blue-200 rounded bg-white mb-2 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
          
          <select 
            value={newKindLayer} 
            onChange={e => setNewKindLayer(e.target.value)}
            disabled={isSubmitting}
            className="w-full text-xs p-2 border border-blue-200 rounded bg-white mb-3 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          >
            <option value="">-- Select Classification --</option>
            <optgroup label="Identities (Concepts, People, Works)">
               {activeKinds.map(k => <option key={k.id} value={`IDENTITY|${k.id}`}>{k.icon} {k.label}</option>)}
            </optgroup>
            <option value="PHYSICAL|null">📦 Physical Item / Container</option>
          </select>
          
          <div className="flex justify-end gap-2">
             <button onClick={() => setIsMintingTrack1(false)} disabled={isSubmitting} className="text-xs text-gray-500 px-3 py-1.5 hover:text-gray-800 cursor-pointer">Cancel</button>
             <button onClick={handleTrack1Submit} disabled={!newLabel || !newKindLayer || isSubmitting} className="text-xs bg-blue-600 text-white px-4 py-1.5 rounded font-bold disabled:opacity-50 cursor-pointer shadow-sm">
               {isSubmitting ? "Minting..." : "Mint Record"}
             </button>
          </div>
        </div>
      )}

      {isUploadingTrack2 && (
        <div className="animate-in fade-in">
           <MediaUploader asButton={false} />
           <div className="p-4 border-b border-gray-200 flex justify-center bg-gray-50">
               <button onClick={() => setIsUploadingTrack2(false)} className="text-xs font-medium text-gray-500 hover:text-gray-800 cursor-pointer">Cancel Global Upload</button>
           </div>
        </div>
      )}

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
                      <a href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                        <span className="truncate block">
                          {node.label}
                          {node.aliases && node.aliases.length > 0 && <span className="text-gray-400 font-normal ml-1.5 text-[10px]">({node.aliases.join(', ')})</span>}
                        </span>
                      </a>
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
                <a href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-emerald-50 text-emerald-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                  <span className="truncate block">
                    <span className="opacity-80 mr-1">📦</span> {node.label}
                  </span>
                </a>
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
          {Object.entries(mediaByFormat).map(([format, nodes]) => (
            <div key={format} className="mb-4">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                <span className="text-xs opacity-80">{getMediaIcon(format)}</span> {format}
              </h3>
              <ul className="space-y-0.5">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <a href={`/?node=${node.id}`} className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${activeNodeId === node.id ? "bg-amber-50 text-amber-800 font-medium" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                      <span className="truncate block">
                        {node.label}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Object.keys(mediaByFormat).length === 0 && <p className="text-xs text-gray-400 italic px-2">No media found.</p>}
        </div>
        
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50/50 mt-auto flex-shrink-0">
        <a href="/dictionary" className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 uppercase tracking-widest transition-colors cursor-pointer">
          <span className="text-sm">⚙️</span> Manage Taxonomy
        </a>
      </div>

    </div>
  );
}