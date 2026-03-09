"use client";

import { useState, useTransition, useEffect } from "react";
import { updateNodeProperties } from "@/app/actions";
import { parseFuzzyTemporal } from "@/lib/dateParser";

export default function PropertiesEditor({
  nodeId,
  layer,
  kind, // Kept in signature for backwards compatibility with page.tsx, though unused for Physical/Media now
  initialProps,
  allNodes,
  notEarlierThan,
  notLaterThan
}: {
  nodeId: string;
  layer: "IDENTITY" | "PHYSICAL" | "MEDIA";
  kind: string | null;
  initialProps: Record<string, any>;
  allNodes: any[];
  notEarlierThan?: Date | null;
  notLaterThan?: Date | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>(initialProps || {});
  const [isPending, startTransition] = useTransition();

  const [liveBounds, setLiveBounds] = useState<{start?: Date, end?: Date}>({});

  useEffect(() => {
    if (isEditing && formData['temporal_input'] !== undefined) {
      const parsed = parseFuzzyTemporal(formData['temporal_input']);
      setLiveBounds({ start: parsed.notEarlierThan, end: parsed.notLaterThan });
    }
  }, [formData, isEditing]);

  // --------------------------------------------------------------------------
  // 3-LAYER DYNAMIC SCHEMA ROUTING
  // --------------------------------------------------------------------------
  let schema: string[] = ['temporal_input'];
  
  if (layer === 'IDENTITY') {
    schema.push('standardized_id', 'notes');
  } 
  else if (layer === 'PHYSICAL') {
    // Merged physical properties. Collections vs Objects handled naturally.
    schema.push('location', 'condition', 'call_number', 'barcode', 'dimensions', 'notes');
  } 
  else if (layer === 'MEDIA') {
    // Media schema routes purely based on system-detected MimeTypes or URL properties
    const mimeType = initialProps.mimeType || '';
    if (mimeType.startsWith('image/')) schema.push('width', 'height', 'fileSize', 'hash', 'notes');
    else if (mimeType.startsWith('video/')) schema.push('duration', 'resolution', 'fileSize', 'hash', 'notes');
    else if (mimeType.startsWith('audio/')) schema.push('duration', 'fileSize', 'hash', 'notes');
    else if (mimeType.includes('pdf') || mimeType.includes('document')) schema.push('pageCount', 'fileSize', 'hash', 'notes');
    else if (initialProps.youtube_id) schema.push('youtube_id', 'notes');
    else if (initialProps.url) schema.push('url', 'archive_url', 'access_date', 'notes');
    else schema.push('fileSize', 'hash', 'notes'); // Generic fallback
  }

  const handleSave = () => {
    startTransition(async () => {
      const cleanedProps = { ...formData };
      // Strip empty strings to keep JSONB clean
      for (const key in cleanedProps) {
        if (!cleanedProps[key] || cleanedProps[key].trim() === '') {
          delete cleanedProps[key];
        }
      }
      await updateNodeProperties(nodeId, cleanedProps);
      setIsEditing(false);
    });
  };

  const getUniqueValues = (key: string) => {
    const values = allNodes
      .map(n => (n.properties || {})[key])
      .filter(val => val && typeof val === 'string');
    return Array.from(new Set(values)) as string[];
  };

  const displayProps = Object.entries(initialProps).filter(([k]) => k !== 'fileUrl' && k !== 'mimeType' && k !== 'temporal_input');

  // Read-Only Mode - Compact, title-less presentation
  if (!isEditing) {
    return (
      <div className="mb-6 p-4 bg-white border border-gray-200 rounded-xl shadow-sm text-sm text-gray-800 relative group transition-colors min-h-[60px]">
        <button 
          onClick={() => {
             setIsEditing(true);
             if (initialProps.temporal_input) {
               const parsed = parseFuzzyTemporal(initialProps.temporal_input);
               setLiveBounds({ start: parsed.notEarlierThan, end: parsed.notLaterThan });
             }
          }}
          className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-widest text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-blue-50 rounded cursor-pointer border border-blue-100 hover:bg-blue-100 z-10"
        >
          Edit ✎
        </button>
        
        {/* IDENTITY Presentation */}
        {layer === 'IDENTITY' ? (
          <div className="flex flex-col gap-1 pr-16">
            <div className="flex flex-wrap items-baseline gap-3">
              {initialProps.temporal_input && <span className="font-semibold text-gray-900">{initialProps.temporal_input}</span>}
              {initialProps.standardized_id && <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{initialProps.standardized_id}</span>}
              {!initialProps.temporal_input && !initialProps.standardized_id && displayProps.length === 0 && (
                <span className="italic text-gray-400 text-xs">No intrinsic properties defined.</span>
              )}
            </div>
            {initialProps.notes && (
              <div className="text-gray-600 text-sm line-clamp-1 hover:line-clamp-none cursor-pointer mt-0.5 transition-all" title="Click to expand full notes">
                {initialProps.notes}
              </div>
            )}
          </div>
        ) : (
          /* PHYSICAL & MEDIA Presentation */
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-16">
             {displayProps.length === 0 && !initialProps.temporal_input ? (
               <span className="italic text-gray-400 text-xs">No intrinsic properties defined.</span>
             ) : (
               <>
                 {initialProps.temporal_input && <span className="font-semibold text-gray-900">{initialProps.temporal_input}</span>}
                 {displayProps.map(([key, val]) => (
                   <span key={key} className={key === 'hash' || key === 'url' ? "text-gray-500 font-mono text-[10px] break-all bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded" : "text-gray-800 font-medium"}>
                     {String(val)}
                   </span>
                 ))}
               </>
             )}
          </div>
        )}
      </div>
    );
  }

  // Edit Mode
  return (
    <div className="mb-6 p-5 bg-white border border-blue-200 rounded-xl shadow-sm text-sm animate-in fade-in slide-in-from-top-2">
      <h3 className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mb-5 flex items-center gap-1.5">
        <span>✏️</span> Edit Properties
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {schema.map(key => {
          const uniqueValues = getUniqueValues(key);
          const isNotes = key === 'notes';
          const isTemporal = key === 'temporal_input';
          
          // Strictly lock payload properties. Users shouldn't edit hashes or URLs directly, they should upload a new file.
          const isSystemLocked = (key === 'hash' || key === 'fileSize' || key === 'mimeType' || key === 'fileUrl' || key === 'youtube_id' || key === 'url');
            
          const displayLabel = isTemporal ? 'Temporal Bounds' : key.replace('_', ' ');

          return (
            <div key={key} className={isNotes || key === 'hash' || key === 'url' || isTemporal ? "sm:col-span-2" : ""}>
              <label className="font-bold text-gray-500 uppercase tracking-wider text-[10px] mb-1.5 block">
                {displayLabel} {isSystemLocked && "(Locked)"}
              </label>
              
              {isNotes ? (
                <textarea
                  value={formData[key] || ''}
                  onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                  disabled={isPending || isSystemLocked}
                  className="w-full p-2.5 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 min-h-[80px] focus:outline-none shadow-sm text-gray-900"
                  placeholder={`Enter ${displayLabel}...`}
                />
              ) : (
                <>
                  <input
                    type="text"
                    list={!isSystemLocked && !isTemporal ? `datalist-${key}` : undefined}
                    value={formData[key] || ''}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    disabled={isPending || isSystemLocked}
                    className={`w-full p-2.5 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none shadow-sm ${isSystemLocked ? 'bg-gray-50 text-gray-400 font-mono text-[10px] cursor-not-allowed' : 'bg-white text-gray-900'}`}
                    placeholder={isSystemLocked ? 'System Locked' : (isTemporal ? 'e.g. 1990s, 1985~1988' : `e.g. input data...`)}
                  />
                  {!isSystemLocked && !isTemporal && (
                    <datalist id={`datalist-${key}`}>
                      {uniqueValues.map(v => <option key={v} value={v} />)}
                    </datalist>
                  )}
                  
                  {isTemporal && (formData[key] || liveBounds.start || liveBounds.end) && (
                    <div className="mt-2.5 bg-emerald-50/50 border border-emerald-100 p-2.5 rounded-md w-fit">
                      <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-widest block mb-1">
                        ↳ System Boundaries:
                      </span>
                      <div className="font-mono text-[10px] text-emerald-900 flex flex-col gap-0.5">
                        <span>Not earlier than: <strong className="font-bold ml-1">{liveBounds.start ? liveBounds.start.toISOString().split('T')[0] : 'Open'}</strong></span>
                        <span>Not later than: <strong className="font-bold ml-3">{liveBounds.end ? liveBounds.end.toISOString().split('T')[0] : 'Open'}</strong></span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
        <button 
          onClick={() => { setFormData(initialProps); setIsEditing(false); }}
          disabled={isPending}
          className="px-4 py-2 text-gray-500 hover:text-gray-800 transition-colors text-xs font-medium cursor-pointer"
        >
          Cancel
        </button>
        <button 
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 transition-colors text-xs disabled:opacity-50 cursor-pointer shadow-sm"
        >
          {isPending ? "Saving..." : "Save Properties"}
        </button>
      </div>
    </div>
  );
}