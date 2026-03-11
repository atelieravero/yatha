"use client";

import { useTransition } from "react";
import { deactivateNode, restoreNode } from "@/app/actions";

export default function NodeTrashToggle({ 
  nodeId, 
  isActive 
}: { 
  nodeId: string; 
  isActive: boolean; 
}) {
  const [isPending, startTransition] = useTransition();

  const handleTrash = () => {
    if (window.confirm("Move this record to the trash? It will be hidden from searches and standard views, but its history is preserved.")) {
      startTransition(async () => {
        await deactivateNode(nodeId);
      });
    }
  };

  const handleRestore = () => {
    startTransition(async () => {
      await restoreNode(nodeId);
    });
  };

  // TOMBSTONE MODE: Big prominent restore button
  if (!isActive) {
    return (
      <button
        onClick={handleRestore}
        disabled={isPending}
        className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-bold uppercase tracking-widest shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isPending ? "Restoring..." : "Restore Record"}
      </button>
    );
  }

  // ACTIVE MODE: Small discreet header button
  return (
    <button
      onClick={handleTrash}
      disabled={isPending}
      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-red-500 bg-white border border-red-100 rounded-md hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
      title="Move to Trash"
    >
      <span>🗑️</span> {isPending ? "..." : "Trash"}
    </button>
  );
}