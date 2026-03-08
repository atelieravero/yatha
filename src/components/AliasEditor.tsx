"use client";

import { useState, useTransition } from "react";
import { updateNodeAliases } from "@/app/actions";

export default function AliasEditor({ 
  nodeId, 
  initialAliases = [] 
}: { 
  nodeId: string; 
  initialAliases: string[]; 
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Helper to safely wrap aliases containing commas in quotes so they aren't split upon the next save
  const formatAliasesForInput = (aliases: string[]) => {
    return aliases.map(a => a.includes(',') ? `"${a}"` : a).join(", ");
  };

  const [inputValue, setInputValue] = useState(formatAliasesForInput(initialAliases));

  const handleSave = () => {
    startTransition(async () => {
      // Smart parsing: 
      // 1. Split by commas ONLY if they are outside of quotation marks
      // 2. Trim whitespace
      // 3. Remove the protective quotation marks
      const parsedAliases = inputValue
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map(s => s.trim())
        .map(s => s.replace(/^"|"$/g, '').trim()) 
        .filter(s => s.length > 0);
      
      await updateNodeAliases(nodeId, parsedAliases);
      setIsEditing(false);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setInputValue(formatAliasesForInput(initialAliases));
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mt-2 w-full max-w-lg animate-in fade-in slide-in-from-top-1">
        <input
          autoFocus
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isPending}
          placeholder='e.g. Mark Twain, "Potter, Harry"'
          className="flex-1 px-2 py-1 text-sm border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono shadow-sm"
        />
        <button 
          onClick={handleSave} 
          disabled={isPending}
          className="px-3 py-1 text-xs bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {isPending ? "..." : "Save"}
        </button>
      </div>
    );
  }

  return (
    <div 
      className="group flex items-center gap-2 mt-1 cursor-pointer min-h-[24px]"
      onClick={() => {
        setInputValue(formatAliasesForInput(initialAliases));
        setIsEditing(true);
      }}
      title="Click to edit aliases"
    >
      {initialAliases.length > 0 ? (
        <div className="text-sm text-gray-500 font-mono group-hover:text-blue-600 transition-colors">
          {initialAliases.join(' • ')}
        </div>
      ) : (
        <div className="text-xs text-gray-400 italic opacity-0 group-hover:opacity-100 transition-opacity">
          + Add aliases (multilingual names, acronyms, etc.)
        </div>
      )}
      <span className="text-blue-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
        ✎
      </span>
    </div>
  );
}