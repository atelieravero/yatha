"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateNodeLabel } from "@/app/actions";

export default function NodeLabelEditor({ 
  nodeId, 
  initialLabel,
  avatarUrl,
  canWrite = true
}: { 
  nodeId: string; 
  initialLabel: string; 
  avatarUrl?: string | null;
  canWrite?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(initialLabel);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync state if the server revalidates and pushes a new prop
  useEffect(() => {
    setLabel(initialLabel);
  }, [initialLabel]);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  const handleSave = () => {
    if (!label.trim() || label === initialLabel) {
      setIsEditing(false);
      setLabel(initialLabel);
      return;
    }
    startTransition(async () => {
      await updateNodeLabel(nodeId, label.trim());
      setIsEditing(false);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setLabel(initialLabel);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2 animate-in fade-in slide-in-from-top-1">
        {avatarUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatarUrl} alt={initialLabel} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-md ring-2 ring-gray-200 dark:ring-zinc-800 shrink-0" />
        )}
        <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isPending}
            className="text-4xl font-serif font-medium text-gray-900 dark:text-zinc-100 border-b-2 border-blue-500 focus:outline-none bg-transparent w-full md:w-3/4 transition-colors"
          />
          <button 
            onClick={handleSave} 
            disabled={isPending} 
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
          >
            {isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
      {avatarUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={avatarUrl} alt={initialLabel} className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover shadow-md ring-2 ring-gray-200 dark:ring-zinc-800 shrink-0" />
      )}
      <h1 
        onClick={() => canWrite && setIsEditing(true)}
        className={`group flex items-center gap-3 text-4xl font-serif font-medium text-gray-900 dark:text-zinc-100 rounded-md -ml-2 p-2 w-fit transition-colors ${canWrite ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800' : ''}`}
        title={canWrite ? "Click to edit node name" : undefined}
      >
        {initialLabel}
        {canWrite && (
          <span className="text-blue-500 text-2xl opacity-0 group-hover:opacity-100 transition-opacity">
            ✎
          </span>
        )}
      </h1>
    </div>
  );
}