"use client";

import { useState, useTransition } from "react";
import { updateNodeKind } from "@/app/actions";

type Kind = { id: string; label: string; icon: string; };

export default function NodeClassification({
  nodeId,
  layer,
  initialKind,
  activeKinds = [],
  canWrite = true,
  avatarUrl
}: {
  nodeId: string;
  layer: "IDENTITY" | "PHYSICAL" | "MEDIA"; // 3-Layer Architecture Natively Enforced
  initialKind: string | null;
  activeKinds?: Kind[];
  canWrite?: boolean;
  avatarUrl?: string | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [kind, setKind] = useState(initialKind || (layer === 'IDENTITY' ? 'k_person' : ''));
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    if (!kind.trim() || kind === initialKind) {
      setIsEditing(false);
      return;
    }
    startTransition(async () => {
      await updateNodeKind(nodeId, kind.trim());
      setIsEditing(false);
    });
  };

  // ============================================================================
  // 1. NON-IDENTITY LAYERS (Immutable Format Badges)
  // ============================================================================
  
  if (layer === 'PHYSICAL') {
    return (
      <>
        {avatarUrl && (
          <img src={avatarUrl} alt="Physical Avatar" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-md ring-2 ring-gray-100 dark:ring-zinc-800" />
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest border border-emerald-200 dark:border-emerald-800/50 shadow-sm cursor-default transition-colors">
          <span className="text-xs">📦</span> Physical Item
        </span>
      </>
    );
  }

  if (layer === 'MEDIA') {
    return (
      <>
        {avatarUrl && (
          <img src={avatarUrl} alt="Media Avatar" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-md ring-2 ring-gray-100 dark:ring-zinc-800" />
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 text-[10px] font-bold uppercase tracking-widest border border-amber-200 dark:border-amber-800/50 shadow-sm cursor-default transition-colors">
          <span className="text-xs">🖼️</span> Digital Media
        </span>
      </>
    );
  }

  // ============================================================================
  // 2. IDENTITY LAYER (Strict Dictionary Combobox)
  // ============================================================================
  
  if (isEditing) {
    return (
      <>
        {avatarUrl && (
          <img src={avatarUrl} alt="Concept Avatar" className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-md ring-2 ring-gray-100 dark:ring-zinc-800" />
        )}
        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
          <select
            autoFocus
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            disabled={isPending}
            className="px-2 py-1 text-[10px] border border-blue-300 dark:border-blue-800/50 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest font-bold text-blue-800 dark:text-blue-400 bg-white dark:bg-zinc-900 shadow-sm outline-none cursor-pointer transition-colors"
          >
            <option value="">-- Select Classification --</option>
            {activeKinds.map(k => (
              <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
            ))}
          </select>
          
          <button 
            onClick={handleSave} 
            disabled={isPending || !kind} 
            className="text-xs px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {isPending ? "..." : "Save"}
          </button>
          <button 
            onClick={() => { setKind(initialKind || ''); setIsEditing(false); }} 
            disabled={isPending} 
            className="text-xs px-2 py-1 text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </>
    );
  }

  // Helper to map DB Kind IDs back to rich UI Labels and Icons
  const kindDef = activeKinds.find(k => k.id === initialKind || k.label === initialKind);
  const displayLabel = kindDef ? kindDef.label : (initialKind || 'Concept');
  const displayIcon = kindDef ? kindDef.icon : '🟣';

  return (
    <>
      {avatarUrl && (
        <img src={avatarUrl} alt={displayLabel} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover shadow-md ring-2 ring-gray-100 dark:ring-zinc-800" />
      )}
      <button 
        onClick={() => canWrite && setIsEditing(true)}
        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 text-[10px] font-bold uppercase tracking-widest border border-blue-200 dark:border-blue-800/50 shadow-sm transition-colors ${canWrite ? 'hover:bg-blue-200 dark:hover:bg-blue-900/40 cursor-pointer' : 'cursor-default'}`}
        title={canWrite ? "Click to change classification" : undefined}
      >
        <span className="text-xs">{displayIcon}</span> {displayLabel}
        {canWrite && <span className="opacity-0 group-hover:opacity-100 ml-1 text-[10px] transition-opacity">✎</span>}
      </button>
    </>
  );
}