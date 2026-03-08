"use client";

import { useState, useTransition } from "react";
import { updateNodeKind } from "@/app/actions";

// Strict icon mapping for Instance Formats
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

type Kind = { id: string; label: string; icon: string; };

export default function NodeClassification({
  nodeId,
  layer,
  initialKind,
  activeKinds = [] // NEW: Replaced allNodes with activeKinds
}: {
  nodeId: string;
  layer: "IDENTITY" | "INSTANCE";
  initialKind: string;
  activeKinds?: Kind[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [kind, setKind] = useState(initialKind || (layer === 'IDENTITY' ? 'k_person' : 'PHYSICAL_OBJECT'));
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

  // 1. INSTANCES: Strict, immutable format badge
  if (layer === 'INSTANCE') {
    const formatLabel = initialKind.replace('_', ' ');
    const icon = FORMAT_ICONS[initialKind] || '📦';
    
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-widest border border-amber-200">
        <span className="text-xs">{icon}</span> {formatLabel}
      </span>
    );
  }

  // 2. IDENTITIES: Strict dictionary combobox
  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <select
          autoFocus
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          disabled={isPending}
          className="px-2 py-1 text-[10px] border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase tracking-widest font-bold text-blue-800 bg-white shadow-sm outline-none"
        >
          <option value="">-- Select Classification --</option>
          {activeKinds.map(k => (
            <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
          ))}
        </select>
        
        <button 
          onClick={handleSave} 
          disabled={isPending || !kind} 
          className="text-xs px-3 py-1 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {isPending ? "..." : "Save"}
        </button>
        <button 
          onClick={() => { setKind(initialKind); setIsEditing(false); }} 
          disabled={isPending} 
          className="text-xs px-2 py-1 text-gray-500 hover:text-gray-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Helper to map DB Kind IDs back to rich UI Labels and Icons
  const kindDef = activeKinds.find(k => k.id === initialKind || k.label === initialKind);
  const displayLabel = kindDef ? kindDef.label : (initialKind || 'Concept');
  const displayIcon = kindDef ? kindDef.icon : '🟣';

  return (
    <button 
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-[10px] font-bold uppercase tracking-widest border border-blue-200 hover:bg-blue-200 transition-colors cursor-pointer"
      title="Click to change classification"
    >
      <span className="text-xs">{displayIcon}</span> {displayLabel}
      <span className="opacity-0 group-hover:opacity-100 ml-1 text-[10px]">✎</span>
    </button>
  );
}