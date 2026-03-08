"use client";

import { useState, useTransition, useEffect } from "react";import EdgeRetractButton from "@/components/EdgeRetractButton";
import { updateEdgeProperties } from "@/app/actions";
import { parseFuzzyTemporal } from "@/lib/dateParser";

const FORMAT_ICONS: Record<string, string> = {
  'PHYSICAL_OBJECT': '📦', 'PHYSICAL_CONTAINER': '🗃️', 'IMAGE': '🖼️', 'VIDEO': '🎞️',
  'AUDIO': '🎵', 'DOCUMENT': '📄', 'YOUTUBE_VIDEO': '📺', 'WEB_LINK': '🔗'
};

export default function EdgeRow({
  edge,
  node,
  isSource,
  predDef,
  currentTab,
  activeNodeId,
  activeKinds,
  hideBadge = false
}: {
  edge: any;
  node: any;
  isSource: boolean;
  predDef: any;
  currentTab: string;
  activeNodeId: string;
  activeKinds: any[];
  hideBadge?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [temporalInput, setTemporalInput] = useState(edge.temporalInput || "");
  const [liveBounds, setLiveBounds] = useState<{start?: Date, end?: Date}>({});
  const [isPending, startTransition] = useTransition();

  const displayPredicate = isSource ? predDef.forwardLabel : predDef.reverseLabel;

  const kindDef = activeKinds.find((k: any) => k.id === node.kind);
  const icon = node.layer === 'INSTANCE' ? (FORMAT_ICONS[node.kind] || '📦') : (kindDef?.icon || '🟣');
  const kindLabel = node.layer === 'INSTANCE' ? node.kind.replace('_', ' ') : (kindDef?.label || 'Concept');

  // Sync live bounds when the user types a temporal bound
  useEffect(() => {
    if (isEditing && temporalInput !== undefined) {
      const parsed = parseFuzzyTemporal(temporalInput);
      setLiveBounds({ start: parsed.notEarlierThan, end: parsed.notLaterThan });
    }
  }, [temporalInput, isEditing]);

  const handleSave = () => {
    startTransition(async () => {
      await updateEdgeProperties(edge.id, temporalInput || null);
      setIsEditing(false);
    });
  };

  if (isEditing) {
    return (
      <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg shadow-sm animate-in fade-in flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-100">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span>✏️ Editing Relationship to:</span>
            <span className="text-gray-900 font-bold">{node.label}</span>
          </div>
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="text-gray-400 hover:text-gray-800 cursor-pointer">✕</button>
        </div>
        
        <div className="w-full sm:max-w-xs">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Temporal Bounds</label>
          <input
            type="text"
            value={temporalInput}
            onChange={e => setTemporalInput(e.target.value)}
            disabled={isPending}
            placeholder="e.g. 1995~1998"
            className="w-full p-2 text-xs border border-gray-200 rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
          {(temporalInput || liveBounds.start || liveBounds.end) && (
            <div className="mt-2 bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-md w-fit">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block mb-1">
                ↳ System Boundaries:
              </span>
              <div className="font-mono text-[10px] text-emerald-900 flex flex-col gap-0.5">
                <span>Not earlier than: <strong className="font-bold ml-1">{liveBounds.start ? liveBounds.start.toISOString().split('T')[0] : 'Open'}</strong></span>
                <span>Not later than: <strong className="font-bold ml-3">{liveBounds.end ? liveBounds.end.toISOString().split('T')[0] : 'Open'}</strong></span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-blue-100">
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="px-4 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="px-5 py-2 text-xs font-bold uppercase tracking-widest bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer">{isPending ? "Saving..." : "Save Edits"}</button>
        </div>
      </div>
    );
  }

  return (
    <div className="group p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <div className="flex flex-wrap items-center gap-3">
        {!hideBadge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${predDef.isSystem ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
            {displayPredicate}
          </span>
        )}
        
        <a href={`/?node=${activeNodeId}&tab=${currentTab}&peek=${node.id}`} className="font-medium text-sm text-gray-900 hover:text-blue-600 hover:underline flex items-center gap-1.5 cursor-pointer max-w-full">
          <span className="opacity-80 text-xs shrink-0" title={kindLabel}>{icon}</span>
          <span className="truncate block">
            {node.label}
            {node.aliases && node.aliases.length > 0 && (
              <span className="text-gray-400 font-normal ml-1.5 text-xs">({node.aliases.join(', ')})</span>
            )}
          </span>
        </a>
        
        {edge.temporalInput && (
          <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200" title="Relationship Temporal Bounds">
            ⏱ {edge.temporalInput}
          </span>
        )}

        {edge.role && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200" title="Relationship Role">
            🎭 {edge.role}
          </span>
        )}
        
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsEditing(true)}
              className="text-xs font-medium text-blue-600 px-2 py-1.5 hover:bg-blue-50 rounded-md cursor-pointer transition-colors" 
              title="Edit Edge Properties"
            >
              ✎ Edit
            </button>
          <EdgeRetractButton edgeId={edge.id} />
        </div>
      </div>
    </div>
  );
}