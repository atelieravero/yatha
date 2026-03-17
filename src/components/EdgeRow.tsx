"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import EdgeRetractButton from "@/components/EdgeRetractButton";
import { parseFuzzyTemporal } from "@/lib/dateParser";
import { updateEdgeProperties } from "@/app/actions";

// Helper for formatting the inferred bounds ghost badge
const formatInferredYear = (date?: Date | string | null) => {
  if (!date) return 'Open';
  const d = new Date(date);
  return isNaN(d.getTime()) ? 'Open' : d.getUTCFullYear();
};

export default function EdgeRow({
  edge,
  node,
  isSource,
  predDef,
  currentTab,
  activeNodeId,
  activeKinds,
  hideBadge = false,
  hideEdit = false, // Prevents editing properties on raw structural edges like CARRIES
  canWrite = true,
  effectiveStart,
  effectiveEnd,
  inferredBounds
}: {
  edge: any;
  node: any;
  isSource: boolean;
  predDef: any;
  currentTab: string;
  activeNodeId: string;
  activeKinds: any[];
  hideBadge?: boolean;
  hideEdit?: boolean;
  canWrite?: boolean;
  effectiveStart?: Date | string | null;
  effectiveEnd?: Date | string | null;
  inferredBounds?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  
  const [temporalInput, setTemporalInput] = useState(edge.temporalInput || "");
  const [locator, setLocator] = useState(edge.properties?.locator || "");
  const [liveBounds, setLiveBounds] = useState<{start?: Date, end?: Date}>({});
  
  const [isPending, startTransition] = useTransition();

  const displayPredicate = isSource ? predDef.forwardLabel : predDef.reverseLabel;

  // --------------------------------------------------------------------------
  // 3-LAYER ICON & LABEL ROUTING
  // --------------------------------------------------------------------------
  let icon = '🟣';
  let kindLabel = 'Concept';

  if (node.layer === 'PHYSICAL') {
    icon = '📦';
    kindLabel = 'Physical Item';
  } else if (node.layer === 'MEDIA') {
    const mime = node.properties?.mimeType || '';
    if (mime.startsWith('image/')) { icon = '🖼️'; kindLabel = 'Image'; }
    else if (mime.startsWith('video/')) { icon = '🎞️'; kindLabel = 'Video'; }
    else if (mime.startsWith('audio/')) { icon = '🎵'; kindLabel = 'Audio'; }
    else if (node.properties?.url) { icon = '🔗'; kindLabel = 'Web Link'; }
    else if (node.properties?.youtube_id) { icon = '📺'; kindLabel = 'YouTube Video'; }
    else { icon = '📄'; kindLabel = 'Document'; }
  } else {
    const kindDef = activeKinds.find((k: any) => k.id === node.kind);
    if (kindDef) {
      icon = kindDef.icon;
      kindLabel = kindDef.label;
    }
  }

  useEffect(() => {
    if (isEditing && temporalInput !== undefined && temporalInput !== 'TIMELESS') {
      const parsed = parseFuzzyTemporal(temporalInput);
      setLiveBounds({ start: parsed.notEarlierThan, end: parsed.notLaterThan });
    }
  }, [temporalInput, isEditing]);

  const handleSave = () => {
    startTransition(async () => {
      const props = locator.trim() ? { locator: locator.trim() } : {};
      await updateEdgeProperties(edge.id, temporalInput || null, props);
      setIsEditing(false);
    });
  };

  if (isEditing && !hideEdit) {
    return (
      <div className="p-4 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50 rounded-lg shadow-sm animate-in fade-in flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-blue-100 dark:border-blue-800/30">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            <span>✏️ Editing Relationship to:</span>
            <span className="text-gray-900 dark:text-gray-100 font-bold">{node.label}</span>
          </div>
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">✕</button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase">Temporal Bounds</label>
              <label className="flex items-center gap-1.5 cursor-pointer" title="Mark this relationship as timeless (e.g. Influence)">
                <span className="text-[10px] font-bold text-gray-400 dark:text-zinc-500 uppercase">Timeless</span>
                <div className="relative inline-flex items-center">
                  <input 
                    type="checkbox" 
                    checked={temporalInput === 'TIMELESS'}
                    onChange={(e) => {
                      if (e.target.checked) setTemporalInput('TIMELESS');
                      else setTemporalInput('');
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-7 h-4 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                </div>
              </label>
            </div>
            <input
              type="text"
              value={temporalInput === 'TIMELESS' ? '' : temporalInput}
              onChange={e => setTemporalInput(e.target.value)}
              disabled={isPending || temporalInput === 'TIMELESS'}
              placeholder={temporalInput === 'TIMELESS' ? 'Timeless Relationship' : 'e.g. 1995~1998'}
              className={`w-full p-2 text-xs border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm transition-colors ${temporalInput === 'TIMELESS' ? 'bg-gray-100 dark:bg-zinc-800/50 cursor-not-allowed placeholder-gray-400 dark:placeholder-zinc-500' : 'bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100'}`}
            />
            {temporalInput !== 'TIMELESS' && (temporalInput || liveBounds.start || liveBounds.end) && (
              <div className="mt-2 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 p-2.5 rounded-md w-fit">
                <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-widest block mb-1">
                  ↳ System Boundaries:
                </span>
                <div className="font-mono text-[10px] text-emerald-900 dark:text-emerald-300 flex flex-col gap-0.5">
                  <span>Not earlier than: <strong className="font-bold ml-1">{liveBounds.start ? liveBounds.start.toISOString().split('T')[0] : 'Open'}</strong></span>
                  <span>Not later than: <strong className="font-bold ml-3">{liveBounds.end ? liveBounds.end.toISOString().split('T')[0] : 'Open'}</strong></span>
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Locator / Position</label>
            <input
              type="text"
              value={locator}
              onChange={e => setLocator(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Page 42, 01:24-01:45"
              className="w-full p-2 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
            />
            <p className="text-[10px] text-gray-400 mt-1.5 font-medium leading-tight">Specify where this subject appears or exactly where this interaction occurred.</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-2 pt-2 border-t border-blue-100 dark:border-blue-800/30">
          <button onClick={() => setIsEditing(false)} disabled={isPending} className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 cursor-pointer">Cancel</button>
          <button onClick={handleSave} disabled={isPending} className="px-5 py-2 text-xs font-bold uppercase tracking-widest bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 shadow-sm cursor-pointer">{isPending ? "Saving..." : "Save Edits"}</button>
        </div>
      </div>
    );
  }

  // --- TOMBSTONE HANDLING (Zombie Links) ---
  const isTargetDead = node.isActive === false;

  return (
    <div className={`group p-3 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-lg shadow-sm hover:shadow-md transition-all ${isTargetDead ? 'opacity-60 bg-gray-50/50 dark:bg-zinc-800/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        {!hideBadge && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${isTargetDead ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-zinc-700' : predDef.isSystem ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/50' : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'}`}>
            {displayPredicate}
          </span>
        )}
        
        {/* Next.js Link to soft-update the URL, opening the target in the Peek Drawer instead of hard-navigating! */}
        <Link 
          scroll={false} 
          href={`/?node=${activeNodeId}&tab=${currentTab}&peek=${node.id}`} 
          className={`font-medium text-sm flex items-center gap-1.5 cursor-pointer max-w-full transition-colors ${isTargetDead ? 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200' : 'text-gray-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 hover:underline'}`}
        >
          <span className={`text-xs shrink-0 ${isTargetDead ? 'grayscale opacity-50' : 'opacity-80'}`} title={kindLabel}>{icon}</span>
          <span className="truncate block">
            <span className={isTargetDead ? 'line-through decoration-gray-400 dark:decoration-zinc-600' : ''}>{node.label}</span>
            {isTargetDead && <span className="ml-2 text-[10px] font-bold text-red-500 uppercase tracking-widest no-underline">(Deleted)</span>}
            {!isTargetDead && node.aliases && node.aliases.length > 0 && (
              <span className="text-gray-400 dark:text-zinc-500 font-normal ml-1.5 text-xs">({node.aliases.join(', ')})</span>
            )}
          </span>
        </Link>

        {locator && (
          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${isTargetDead ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-zinc-700' : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'}`} title="Locator / Position">
            📍 {locator}
          </span>
        )}
        
        {edge.temporalInput === 'TIMELESS' ? (
          <span className="text-[10px] font-bold uppercase tracking-widest bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 transition-colors" title="Timeless Relationship">
            ⏱ Timeless
          </span>
        ) : edge.temporalInput ? (
          <span className="text-[10px] font-mono bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 px-1.5 py-0.5 rounded border border-gray-200 dark:border-zinc-700 transition-colors" title="Relationship Temporal Bounds">
            ⏱ {edge.temporalInput}
          </span>
        ) : inferredBounds ? (
          <span 
            onClick={(e) => {
              e.preventDefault();
              if (canWrite && !hideEdit && !isTargetDead) setIsEditing(true);
            }}
            className={`text-[10px] font-mono bg-transparent text-gray-400 dark:text-zinc-500 px-1.5 py-0.5 rounded border border-dashed border-gray-300 dark:border-zinc-700 transition-colors ${canWrite && !hideEdit && !isTargetDead ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:text-gray-600 dark:hover:text-zinc-300' : ''}`} 
            title="Calculated from node lifespans. Click to define explicit bounds."
          >
            ⏱ [Inferred: {formatInferredYear(effectiveStart)} → {formatInferredYear(effectiveEnd)}]
          </span>
        ) : null}
        
        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pl-2">
            {canWrite && !hideEdit && !isTargetDead && (
              <button 
                onClick={() => setIsEditing(true)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md cursor-pointer transition-colors" 
                title="Edit Edge Properties"
              >
                ✎ Edit
              </button>
            )}
            
            {/* Quick action to go to a dead node to restore it */}
            {canWrite && isTargetDead && (
               <Link 
                 scroll={false}
                 href={`/?node=${node.id}`}
                 className="text-xs font-bold text-blue-500 dark:text-blue-400 px-2 py-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md cursor-pointer transition-colors uppercase tracking-widest" 
                 title="Go to Tombstone"
               >
                 Restore
               </Link>
            )}
            
          {canWrite && <EdgeRetractButton edgeId={edge.id} />}
        </div>
      </div>
    </div>
  );
}