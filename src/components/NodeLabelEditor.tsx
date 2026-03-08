"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updateNodeLabel } from "@/app/actions";

export default function NodeLabelEditor({ 
  nodeId, 
  initialLabel 
}: { 
  nodeId: string; 
  initialLabel: string; 
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
      <div className="flex items-center gap-3 mb-2 animate-in fade-in slide-in-from-top-1">
        <input
          ref={inputRef}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          className="text-4xl font-serif font-medium text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent w-full md:w-3/4"
        />
        <button 
          onClick={handleSave} 
          disabled={isPending} 
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
        >
          {isPending ? "Saving..." : "Save"}
        </button>
      </div>
    );
  }

  return (
    <h1 
      onClick={() => setIsEditing(true)}
      className="group flex items-center gap-3 text-4xl font-serif font-medium text-gray-900 mb-2 cursor-pointer hover:bg-gray-50 rounded-md -ml-2 p-2 transition-colors w-fit"
      title="Click to edit node name"
    >
      {initialLabel}
      <span className="text-blue-500 text-2xl opacity-0 group-hover:opacity-100 transition-opacity">
        ✎
      </span>
    </h1>
  );
}