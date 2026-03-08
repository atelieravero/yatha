"use client";

import { useState, useTransition } from "react";
import EdgeRetractButton from "@/components/EdgeRetractButton";
import { updateEdgeProperties } from "@/app/actions";

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

export default function ReferenceRow({
  edge,
  node,
  isSource,
  currentTab,
  activeNodeId,
  activeKinds
}: {
  edge: any;
  node: any;
  isSource: boolean;
  currentTab: string;
  activeNodeId: string;
  activeKinds: any[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [locator, setLocator] = useState(edge.properties?.locator || "");
  const [isPending, startTransition] = useTransition();

  const kindDef = activeKinds.find((k: any) => k.id === node.kind);
  const icon = node.layer === 'INSTANCE' ? (FORMAT_ICONS[node.kind] || '📦') : (kindDef?.icon || '🟣');
  const kindLabel = node.layer === 'INSTANCE' ? node.kind.replace('_', ' ') : (kindDef?.label || 'Concept');

  const handleSave = () => {
    startTransition(async () => {
      // Safely pass the updated locator property into the JSONB payload
      const props = locator.trim() ? { locator: locator.trim() } : {};
      
      // Pass the existing edge.temporalInput so it isn't lost during the locator update
      await updateEdgeProperties(edge.id, edge.temporalInput || null, props);
      setIsEditing(false);
    });
  };

  if (isEditing) {
    return (
      <div className="p-4 bg-emerald-50/50 border border-emerald-200 rounded-lg shadow-sm animate-in fade-in flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-emerald-100">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span>✏️ Editing Position:</span>
            <span className="text-gray-900 font-bold">{node.label}</span>
          </div>
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="text-gray-400 hover:text-gray-800 cursor-pointer">✕</button>
        </div>
        
        <div className="w-full sm:max-w-xs">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Locator / Position</label>
          <input
            type="text"
            value={locator}
            onChange={e => setLocator(e.target.value)}
            disabled={isPending}
            placeholder="e.g. Page 42, 01:24-01:45"
            className="w-full p-2 text-xs border border-gray-200 rounded bg-white focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
          />
        </div>

        <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-emerald-100">
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="px-5 py-2 text-xs font-bold uppercase tracking-widest bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 shadow-sm cursor-pointer">{isPending ? "Saving..." : "Save Edits"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex justify-between items-start">
      <div className="flex flex-wrap items-center gap-3">
        <a href={`/?node=${activeNodeId}&tab=${currentTab}&peek=${node.id}`} className="font-medium text-sm text-gray-900 hover:text-emerald-600 hover:underline flex items-center gap-1.5 cursor-pointer max-w-full">
          <span className="opacity-80 text-xs shrink-0" title={kindLabel}>{icon}</span>
          <span className="truncate block">
            {node.label}
            {node.aliases && node.aliases.length > 0 && (
              <span className="text-gray-400 font-normal ml-1.5 text-xs">({node.aliases.join(', ')})</span>
            )}
          </span>
        </a>

        {locator && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200" title="Locator / Position">
            📍 {locator}
          </span>
        )}
        
        {edge.temporalInput && (
          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200" title="Relationship Temporal Bounds">
            ⏱ {edge.temporalInput}
          </span>
        )}
      </div>
      
      <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
          <button 
            onClick={() => setIsEditing(true)}
            className="text-xs font-medium text-emerald-600 px-2 py-1.5 hover:bg-emerald-50 rounded-md cursor-pointer transition-colors" 
            title="Edit Position"
          >
            ✎ Edit
          </button>
        <EdgeRetractButton edgeId={edge.id} />
      </div>
    </div>
  );
}