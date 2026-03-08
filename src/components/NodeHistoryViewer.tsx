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
      await restoreNodeSnapshot(nodeId, snapshotId);
      setIsOpen(false);
    });
  };

  return (
    <>
      <button 
        onClick={handleOpen}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-md hover:bg-gray-50 hover:text-gray-900 transition-colors cursor-pointer shadow-sm"
      >
        <span>📜</span> View History
      </button>

      {/* Slide-over Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-gray-900/20 backdrop-blur-sm">
          
          {/* Click outside to close */}
          <div className="absolute inset-0 cursor-pointer" onClick={() => setIsOpen(false)} />

          {/* Slide-over Panel */}
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-gray-200 flex flex-col animate-in slide-in-from-right-full duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <span>📜</span> Node Event Ledger
              </h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-gray-800 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoading ? (
                <div className="text-center p-8 text-gray-400 text-sm flex flex-col items-center gap-2">
                  <span className="animate-spin text-2xl">⏳</span>
                  Loading ledger...
                </div>
              ) : history.length === 0 ? (
                <div className="text-center p-8 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-xl">
                  No historical events found.<br/>This node is in its original state.
                </div>
              ) : (
                history.map((snapshot) => (
                  <div key={snapshot.snapshotId} className="border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm">
                    {/* Header */}
                    <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center">
                      <span className="text-xs font-mono text-gray-500">
                        {new Date(snapshot.replacedAt).toLocaleString()}
                      </span>
                      <button
                        onClick={() => handleRestore(snapshot.snapshotId)}
                        disabled={isPending}
                        className="text-[10px] uppercase tracking-wider font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {isPending ? "Restoring..." : "Restore This"}
                      </button>
                    </div>
                    
                    {/* Snapshot Data */}
                    <div className="p-3 text-sm space-y-2">
                      <div>
                        <span className="text-xs font-bold text-gray-400 uppercase block mb-0.5">Label</span>
                        <span className="font-medium text-gray-900">{snapshot.previousLabel}</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase block mb-0.5">Kind</span>
                          <span className="text-gray-600">{snapshot.previousKind}</span>
                        </div>
                        {snapshot.previousTemporalInput && (
                          <div>
                            <span className="text-xs font-bold text-gray-400 uppercase block mb-0.5">Time Bound</span>
                            <span className="text-gray-600">{snapshot.previousTemporalInput}</span>
                          </div>
                        )}
                      </div>

                      {snapshot.previousAliases?.length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase block mb-0.5">Aliases</span>
                          <span className="text-gray-600">{snapshot.previousAliases.join(", ")}</span>
                        </div>
                      )}

                      {Object.keys(snapshot.previousProperties || {}).length > 0 && (
                        <div>
                          <span className="text-xs font-bold text-gray-400 uppercase block mb-1">Properties</span>
                          <div className="bg-gray-50 p-2 rounded text-xs font-mono text-gray-600 overflow-x-auto whitespace-pre-wrap">
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