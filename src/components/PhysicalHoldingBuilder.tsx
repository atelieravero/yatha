"use client";

import { useState, useTransition } from "react";
import { createPhysicalHolding } from "@/app/actions";

export default function PhysicalHoldingBuilder({ 
  identityId, 
  identityLabel = "Concept" 
}: { 
  identityId: string;
  identityLabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Form State
  const defaultLabel = `Physical Copy of: ${identityLabel}`;
  const [label, setLabel] = useState(defaultLabel);
  const [location, setLocation] = useState("");
  const [callNumber, setCallNumber] = useState("");
  const [condition, setCondition] = useState("");

  const handleCreate = () => {
    if (!label.trim()) return;

    startTransition(async () => {
      // Passes the data to the compound action in actions.ts
      await createPhysicalHolding(identityId, label.trim(), {
        location: location.trim(),
        call_number: callNumber.trim(),
        condition: condition.trim()
      });

      // Reset & Close
      setIsOpen(false);
      setLabel(defaultLabel);
      setLocation("");
      setCallNumber("");
      setCondition("");
    });
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-gray-100 text-gray-600 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border border-gray-200 flex items-center gap-1.5"
      >
        <span>+ Add Holding</span>
      </button>
    );
  }

  return (
    <div className="border border-blue-200 bg-blue-50/30 rounded-xl shadow-sm animate-in fade-in slide-in-from-top-2 p-5 mb-4">
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between mb-4">
        <span className="flex items-center gap-2"><span>📦</span> Log Physical Holding</span>
        <button 
          onClick={() => setIsOpen(false)} 
          disabled={isPending} 
          className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-left">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Holding Name / Identifier</label>
          <input 
            type="text" 
            value={label} 
            onChange={e => setLabel(e.target.value)}
            disabled={isPending}
            className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900 font-medium shadow-sm"
            placeholder="e.g. First Edition Hardcover"
          />
        </div>
        
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Physical Location</label>
          <input 
            type="text" 
            value={location} 
            onChange={e => setLocation(e.target.value)}
            disabled={isPending}
            className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-800 shadow-sm"
            placeholder="e.g. Box 14, Shelf B"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Call Number / Barcode</label>
          <input 
            type="text" 
            value={callNumber} 
            onChange={e => setCallNumber(e.target.value)}
            disabled={isPending}
            className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-800 font-mono shadow-sm"
            placeholder="e.g. MSS-192-A"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Condition Notes</label>
          <input 
            type="text" 
            value={condition} 
            onChange={e => setCondition(e.target.value)}
            disabled={isPending}
            className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-800 shadow-sm"
            placeholder="e.g. Good; slight foxing on edges"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100">
        <button 
          onClick={() => setIsOpen(false)}
          disabled={isPending}
          className="px-4 py-2 text-gray-500 hover:text-gray-800 transition-colors text-xs font-medium cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={handleCreate}
          disabled={isPending || !label.trim()}
          className="px-5 py-2 bg-gray-900 text-white rounded font-medium hover:bg-gray-800 disabled:opacity-50 shadow-sm transition-colors cursor-pointer text-xs"
        >
          {isPending ? "Logging..." : "Log Holding"}
        </button>
      </div>
    </div>
  );
}