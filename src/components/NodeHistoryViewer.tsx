"use client";

import { useState, useTransition } from "react";
import { getNodeHistory, restoreNodeSnapshot } from "@/app/actions";

export default function NodeHistoryViewer({ nodeId }: { nodeId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleOpen = async () => {
    setIsOpen(true);
    setIsLoading(true);
    try {
      const data = await getNodeHistory(nodeId);
      setHistory(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = (snapshotId: string) => {
    if (!window.confirm("Are you sure you want to restore this version? The current state will be safely saved to history before rewinding.")) return;
    
    startTransition(async () => {
      try {
        await restoreNodeSnapshot(nodeId, snapshotId);
        setIsOpen(false);
      } catch (e: any) {
        alert(e.message || "Failed to restore. You may not have permission.");
      }
    });
  };

  return (
    <>
      <button 
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-zinc-400 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors cursor-pointer shadow-sm"
      >
        <span>📜</span> View History
      </button>

      {/* Slide-over Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end items-end md:items-stretch bg-gray-900/20 dark:bg-black/60 backdrop-blur-sm transition-colors duration-300">
          
          {/* Click outside to close */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setIsOpen(false)} />

          {/* Slide-over Panel (Slides up on mobile, right on desktop) */}
          <div className="relative w-full max-w-md h-[85vh] md:h-full bg-white dark:bg-zinc-950 shadow-2xl border-t md:border-t-0 md:border-l border-gray-200 dark:border-zinc-800 flex flex-col animate-in slide-in-from-bottom-full md:slide-in-from-right-full duration-300 rounded-t-2xl md:rounded-none transition-colors">
            
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50 rounded-t-2xl md:rounded-none transition-colors">
              <h2 className="font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                <span>📜</span> Node Event Ledger
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-800 dark:hover:text-zinc-200 p-1 cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="text-center p-8 text-gray-400 dark:text-zinc-500 text-sm flex flex-col items-center gap-2 animate-pulse">
                  <span className="animate-spin text-2xl">⏳</span>
                  Loading ledger...
                </div>
              ) : history.length === 0 ? (
                <div className="text-center p-8 text-gray-400 dark:text-zinc-500 text-sm border-2 border-dashed border-gray-100 dark:border-zinc-800 rounded-xl">
                  No historical events found.<br/>This node is in its original state.
                </div>
              ) : (
                history.map((snapshot) => (
                  <div key={snapshot.snapshotId} className="border border-gray-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 overflow-hidden shadow-sm transition-colors">
                    
                    {/* Header: User & Timestamp */}
                    <div className="bg-gray-50 dark:bg-zinc-800/50 px-3 py-2 border-b border-gray-200 dark:border-zinc-800 flex justify-between items-center transition-colors">
                      <div className="flex items-center gap-2">
                        {snapshot.userAvatar ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={snapshot.userAvatar} alt="User" className="w-5 h-5 rounded-full shadow-sm object-cover" />
                        ) : (
                          <div className="w-5 h-5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center text-[9px] font-bold shadow-sm">
                            {(snapshot.userName || snapshot.userEmail || "S")[0].toUpperCase()}
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-gray-800 dark:text-zinc-200 leading-none">
                            {snapshot.userName || snapshot.userEmail || "System Migration"}
                          </span>
                          <span className="text-[9px] text-gray-500 dark:text-zinc-500 font-mono mt-0.5">
                            {new Date(snapshot.replacedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRestore(snapshot.snapshotId)}
                        disabled={isPending}
                        className="text-[10px] uppercase tracking-wider font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50 cursor-pointer border border-blue-100 dark:border-blue-800/50 shadow-sm"
                      >
                        {isPending ? "Restoring..." : "Restore"}
                      </button>
                    </div>
                    
                    {/* Snapshot Data */}
                    <div className="p-3 text-sm space-y-2">
                      <div>
                        <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-0.5">Label</span>
                        <span className="font-medium text-gray-900 dark:text-zinc-100">{snapshot.previousLabel}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-0.5">Kind</span>
                          <span className="text-gray-600 dark:text-zinc-300">{snapshot.previousKind}</span>
                        </div>
                        {snapshot.previousTemporalInput && (
                          <div>
                            <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-0.5">Time Bound</span>
                            <span className="text-gray-600 dark:text-zinc-300">{snapshot.previousTemporalInput}</span>
                          </div>
                        )}
                      </div>

                      {snapshot.previousAliases?.length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-0.5">Aliases</span>
                          <span className="text-gray-600 dark:text-zinc-300">{snapshot.previousAliases.join(", ")}</span>
                        </div>
                      )}

                      {Object.keys(snapshot.previousProperties || {}).length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 dark:text-zinc-500 uppercase block mb-1">Properties</span>
                          <div className="bg-gray-50 dark:bg-zinc-950 p-2 rounded text-xs font-mono text-gray-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap border border-gray-100 dark:border-zinc-800 transition-colors">
                            {JSON.stringify(snapshot.previousProperties, null, 2)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}