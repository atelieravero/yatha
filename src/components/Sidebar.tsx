"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createNode, searchGraphNodes } from "@/app/actions";

type Node = {
  id: string;
  label: string;
  layer: "IDENTITY" | "INSTANCE";
  kind: string; 
  aliases?: string[];
};

type Kind = {
  id: string;
  label: string;
  icon: string;
};

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

const INSTANCE_FORMATS = [
  'PHYSICAL_OBJECT', 'PHYSICAL_CONTAINER', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'YOUTUBE_VIDEO', 'WEB_LINK'
];

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

  const [isCreating, setIsCreating] = useState<"IDENTITY" | "INSTANCE" | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState("");
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

  // Group Identities by Kind
  const identitiesByKind = filteredNodes
    .filter((n) => n.layer === "IDENTITY")
    .reduce((acc, node) => {
      const k = node.kind || 'Unclassified';
      if (!acc[k]) acc[k] = [];
      acc[k].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

  // Group Instances by Format
  const instancesByFormat = filteredNodes
    .filter((n) => n.layer === "INSTANCE")
    .reduce((acc, node) => {
      const k = node.kind || 'PHYSICAL_OBJECT';
      if (!acc[k]) acc[k] = [];
      acc[k].push(node);
      return acc;
    }, {} as Record<string, Node[]>);

  // Helper to map DB Kind IDs back to rich UI Labels and Icons
  const getKindDisplay = (kindId: string) => {
    const kindDef = activeKinds?.find(k => k.id === kindId || k.label === kindId);
    if (kindDef) return { label: kindDef.label, icon: kindDef.icon };
    return { label: kindId || 'Unclassified', icon: '🟣' };
  };

  const handleCreateSubmit = async () => {
    if (!newLabel.trim() || !newKind.trim() || !isCreating) return;
    try {
      setIsSubmitting(true);
      const newId = await createNode(newLabel.trim(), isCreating, newKind.trim());
      setIsCreating(null);
      setNewLabel("");
      setNewKind("");
      router.push(`/?node=${newId}`);
    } catch (error) {
      console.error("Failed to create node:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-72 bg-white border-r border-gray-200 h-screen flex flex-col flex-shrink-0 z-10 relative">
      {/* Brand Header */}
      <div className="p-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-xl">📚</span>
        <h1 className="font-serif font-bold text-xl tracking-tight text-gray-900">
          yathā
        </h1>
      </div>

      {/* Global Search */}
      <div className="p-4 border-b border-gray-100">
        <div className="relative">
          <span className="absolute left-3 top-2.5 text-gray-400 text-sm">
            {isSearching ? "⏳" : "🔍"}
          </span>
          <input
            type="text"
            placeholder="Search names, aliases, kinds..."
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Navigation Tree */}
      <div className="flex-1 overflow-y-auto p-4 space-y-8">
        
        {/* ========================================================= */}
        {/* IDENTITIES SECTION                                        */}
        {/* ========================================================= */}
        <div>
          <div className="flex items-center justify-between mb-4 group">
            <h2 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">
              Identities
            </h2>
            <button 
              onClick={() => { setIsCreating("IDENTITY"); setNewKind(""); setNewLabel(""); }}
              className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-50 hover:bg-blue-50 rounded px-2 cursor-pointer"
              title="Create new Identity"
            >
              + Add
            </button>
          </div>
          
          {/* Strict Identity Creation Form */}
          {isCreating === "IDENTITY" && (
            <div className="px-3 py-3 mb-4 bg-blue-50/50 rounded-lg border border-blue-200 shadow-sm animate-in fade-in slide-in-from-top-2">
              <input
                autoFocus
                type="text"
                placeholder="Name (e.g. Mark Twain)"
                className="w-full text-sm border-b border-blue-200 focus:outline-none focus:border-blue-600 bg-transparent py-1 mb-3 text-gray-900 placeholder-gray-400"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              
              <select
                className="w-full text-xs border border-blue-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white rounded p-1.5 mb-2 text-gray-900"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              >
                <option value="">-- Select Classification --</option>
                {activeKinds.map(k => (
                  <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
                ))}
              </select>

              <div className="flex justify-between items-center mt-3 pt-1 border-t border-blue-200/50">
                <a href="/dictionary" className="text-[10px] text-blue-600 font-medium hover:underline">
                  + New Kind
                </a>
                <div className="flex gap-2">
                  <button onClick={() => setIsCreating(null)} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Cancel</button>
                  <button 
                    onClick={handleCreateSubmit} 
                    disabled={isSubmitting || !newLabel || !newKind} 
                    className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded font-medium disabled:opacity-50 cursor-pointer shadow-sm"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Grouped Identity Lists */}
          {Object.entries(identitiesByKind).map(([kindId, nodes]) => {
            const { label, icon } = getKindDisplay(kindId);
            return (
              <div key={kindId} className="mb-4">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                  <span className="text-xs opacity-80">{icon}</span>
                  {label}
                </h3>
                <ul className="space-y-0.5">
                  {nodes.map((node) => (
                    <li key={node.id}>
                      <a
                        href={`/?node=${node.id}`}
                        className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${
                          activeNodeId === node.id
                            ? "bg-blue-50 text-blue-800 font-medium"
                            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                        }`}
                      >
                        <span className="truncate block">
                          {node.label}
                          {/* Point 8a: Exposing aliases inline in sidebar */}
                          {node.aliases && node.aliases.length > 0 && (
                            <span className="text-gray-400 font-normal ml-1.5 text-[10px]">({node.aliases.join(', ')})</span>
                          )}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {Object.keys(identitiesByKind).length === 0 && !isCreating && (
            <p className="text-xs text-gray-400 italic px-2">No identities found.</p>
          )}
        </div>

        {/* ========================================================= */}
        {/* INSTANCES SECTION                                         */}
        {/* ========================================================= */}
        <div className="pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4 group">
            <h2 className="text-[10px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded">
              Instances
            </h2>
            <button 
              onClick={() => { setIsCreating("INSTANCE"); setNewKind(""); setNewLabel(""); }}
              className="text-gray-400 hover:text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-50 hover:bg-amber-50 rounded px-2 cursor-pointer"
              title="Create new Instance"
            >
              + Add
            </button>
          </div>
          
          {/* Instance Creation Form */}
          {isCreating === "INSTANCE" && (
            <div className="px-3 py-3 mb-4 bg-amber-50/50 rounded-lg border border-amber-200 shadow-sm animate-in fade-in slide-in-from-top-2">
              <input
                autoFocus
                type="text"
                placeholder="Name (e.g. Audio Cassette #4)"
                className="w-full text-sm border-b border-amber-200 focus:outline-none focus:border-amber-600 bg-transparent py-1 mb-3 text-gray-900 placeholder-gray-400"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
              />
              <select
                className="w-full text-xs border border-amber-200 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 bg-white rounded p-1.5 mb-3 text-gray-900"
                value={newKind}
                onChange={(e) => setNewKind(e.target.value)}
              >
                <option value="">-- Select Strict Format --</option>
                {INSTANCE_FORMATS.map(f => (
                  <option key={f} value={f}>{FORMAT_ICONS[f]} {f.replace('_', ' ')}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2">
                <button onClick={() => setIsCreating(null)} className="text-xs text-gray-500 hover:text-gray-800 cursor-pointer">Cancel</button>
                <button 
                  onClick={handleCreateSubmit} 
                  disabled={isSubmitting || !newLabel || !newKind} 
                  className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded font-medium disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {/* Grouped Instance Lists */}
          {Object.entries(instancesByFormat).map(([format, nodes]) => (
            <div key={format} className="mb-4">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2 mb-1.5 flex items-center gap-1.5">
                <span className="text-xs opacity-80">{FORMAT_ICONS[format] || '📦'}</span>
                {format.replace('_', ' ')}
              </h3>
              <ul className="space-y-0.5">
                {nodes.map((node) => (
                  <li key={node.id}>
                    <a
                      href={`/?node=${node.id}`}
                      className={`block px-3 py-1.5 rounded-md text-sm transition-colors overflow-hidden ${
                        activeNodeId === node.id
                          ? "bg-amber-50 text-amber-800 font-medium"
                          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                      }`}
                    >
                      <span className="truncate block">
                        {node.label}
                        {/* Point 8a: Exposing aliases inline in sidebar */}
                        {node.aliases && node.aliases.length > 0 && (
                          <span className="text-gray-400 font-normal ml-1.5 text-[10px]">({node.aliases.join(', ')})</span>
                        )}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {Object.keys(instancesByFormat).length === 0 && !isCreating && (
            <p className="text-xs text-gray-400 italic px-2">No instances found.</p>
          )}
        </div>
        
      </div>

      {/* FOOTER: Settings & Dictionary Link */}
      <div className="p-4 border-t border-gray-200 bg-gray-50/50 mt-auto flex-shrink-0">
        <a 
          href="/dictionary" 
          className="flex items-center gap-2 text-xs font-bold text-gray-500 hover:text-gray-900 uppercase tracking-widest transition-colors cursor-pointer"
        >
          <span className="text-sm">⚙️</span> Manage Taxonomy
        </a>
      </div>

    </div>
  );
}