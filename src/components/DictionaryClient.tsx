"use client";

import { useState, useTransition } from "react";
import { createKind, updateKind, deactivateAndMigrateKind } from "@/app/actions";

const INSTANCE_FORMATS = [
  'PHYSICAL_OBJECT', 'PHYSICAL_CONTAINER', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'YOUTUBE_VIDEO', 'WEB_LINK'
];

// Point 8: Curated, lightweight archival emoji grid
const EMOJI_GRID = [
  '🟣', '📚', '🖼️', '👤', '🏛️', '🗺️', '📜', '🎵', 
  '🏺', '🎥', '📝', '💭', '🌍', '🏢', '⚙️', '💎',
  '🎭', '🧬', '📼', '📖', '🗃️', '🏷️', '📷', '🎬'
];

type Kind = {
  id: string;
  label: string;
  icon: string;
  isActive: boolean;
};

export default function DictionaryClient({ 
  initialKinds, 
  nodeCounts 
}: { 
  initialKinds: Kind[]; 
  nodeCounts: Record<string, number>;
}) {
  const [isPending, startTransition] = useTransition();

  // Creation State
  const [newLabel, setNewLabel] = useState("");
  const [newIcon, setNewIcon] = useState("🟣");
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Migration State
  const [migratingId, setMigratingId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>("");

  const activeKinds = initialKinds.filter(k => k.isActive);
  const inactiveKinds = initialKinds.filter(k => !k.isActive);

  const validateKindName = (label: string, excludeId?: string) => {
    const normalized = label.trim().toLowerCase();
    
    // 1. Forbid formats (checks both 'PHYSICAL_OBJECT' and 'physical object')
    if (INSTANCE_FORMATS.some(f => f.toLowerCase().replace(/_/g, ' ') === normalized || f.toLowerCase() === normalized)) {
      return "Reserved name: Cannot use an Instance format.";
    }
    
    // 2. Forbid other active kinds
    if (activeKinds.some(k => k.id !== excludeId && k.label.toLowerCase() === normalized)) {
      return "An active classification with this name already exists.";
    }
    
    return null;
  };

  const handleCreate = () => {
    if (!newLabel.trim()) return;

    const error = validateKindName(newLabel);
    if (error) {
      setCreateError(error);
      return;
    }

    startTransition(async () => {
      await createKind(newLabel.trim(), newIcon.trim() || "🟣");
      setNewLabel("");
      setNewIcon("🟣");
      setCreateError(null);
    });
  };

  const handleEditStart = (kind: Kind) => {
    setEditingId(kind.id);
    setEditLabel(kind.label);
    setEditIcon(kind.icon);
    setEditError(null);
    setMigratingId(null); 
  };

  const handleEditSave = (id: string) => {
    if (!editLabel.trim()) return;

    const error = validateKindName(editLabel, id);
    if (error) {
      setEditError(error);
      return;
    }

    startTransition(async () => {
      await updateKind(id, editLabel.trim(), editIcon.trim() || "🟣");
      setEditingId(null);
      setEditError(null);
    });
  };

  const handleMigrate = (oldId: string) => {
    if (!targetId) return;
    startTransition(async () => {
      await deactivateAndMigrateKind(oldId, targetId);
      setMigratingId(null);
      setTargetId("");
    });
  };

  const handleDeactivateEmpty = (oldId: string) => {
    startTransition(async () => {
      const dummyTargetId = activeKinds.find(k => k.id !== oldId)?.id || "dummy_id";
      await deactivateAndMigrateKind(oldId, dummyTargetId);
      setMigratingId(null);
      setTargetId("");
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      
      {/* LEFT COLUMN: Creation Form */}
      <div className="lg:col-span-1 space-y-6">
        <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-blue-800 uppercase tracking-widest mb-4 flex items-center gap-2">
            <span>✨</span> Mint New Kind
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Classification Label</label>
              <input
                type="text"
                placeholder="e.g. Person, Artwork"
                value={newLabel}
                onChange={(e) => { setNewLabel(e.target.value); setCreateError(null); }}
                disabled={isPending}
                className="w-full p-2 text-sm border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
              />
              {createError && (
                <p className="text-xs text-red-500 font-medium mt-1">{createError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Emoji / Icon</label>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  maxLength={2}
                  value={newIcon}
                  onChange={(e) => setNewIcon(e.target.value)}
                  disabled={isPending}
                  className="w-16 p-2 text-center text-xl border border-blue-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                
                {/* Lightweight Emoji Picker */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-white border border-blue-100 rounded-md shadow-inner">
                  {EMOJI_GRID.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewIcon(emoji)}
                      disabled={isPending}
                      className="w-7 h-7 flex items-center justify-center bg-gray-50 border border-gray-200 rounded hover:bg-blue-100 hover:border-blue-300 transition-colors text-sm cursor-pointer shadow-sm"
                      title={`Select ${emoji}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={isPending || !newLabel.trim()}
              className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer mt-2"
            >
              {isPending ? "Minting..." : "Create Classification"}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: Active Dictionary */}
      <div className="lg:col-span-2 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📖</span> Active Classifications
          </h2>
          
          <div className="space-y-3">
            {activeKinds.length === 0 && (
              <p className="text-sm text-gray-400 italic p-4 border border-dashed rounded-lg">No active classifications found.</p>
            )}
            
            {activeKinds.map(kind => {
              const count = nodeCounts[kind.id] || 0;
              const isMigrating = migratingId === kind.id;
              const isEditing = editingId === kind.id;

              return (
                <div key={kind.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm transition-all hover:shadow-md">
                  
                  {isEditing ? (
                    <div className="flex flex-col gap-2 animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          maxLength={2}
                          value={editIcon}
                          onChange={(e) => setEditIcon(e.target.value)}
                          className="w-14 p-1.5 text-center text-xl border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                        <input
                          type="text"
                          value={editLabel}
                          onChange={(e) => { setEditLabel(e.target.value); setEditError(null); }}
                          className="flex-1 p-2 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-gray-900"
                        />
                        <button 
                          onClick={() => handleEditSave(kind.id)}
                          disabled={isPending}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
                        >
                          {isPending ? "..." : "Save"}
                        </button>
                        <button 
                          onClick={() => { setEditingId(null); setEditError(null); }}
                          disabled={isPending}
                          className="px-3 py-1.5 text-gray-500 text-xs font-bold hover:text-gray-800 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                      
                      {/* Inline Emoji Grid for Quick Editing */}
                      <div className="flex flex-wrap gap-1 bg-gray-50 p-1.5 rounded-md border border-gray-200 w-fit">
                        {EMOJI_GRID.map(emoji => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditIcon(emoji)}
                            className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded hover:bg-blue-100 transition-colors text-xs cursor-pointer shadow-sm"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      {editError && (
                        <p className="text-xs text-red-500 font-medium mt-1">{editError}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{kind.icon}</span>
                        <div>
                          <h3 className="font-bold text-gray-900">{kind.label}</h3>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full">
                          {count} {count === 1 ? 'node' : 'nodes'}
                        </span>
                        
                        <div className="flex gap-1 ml-2">
                          <button
                            onClick={() => handleEditStart(kind)}
                            disabled={isPending || isMigrating}
                            className="text-xs font-bold text-blue-600 hover:bg-blue-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer"
                          >
                            Edit
                          </button>
                          
                          {count === 0 ? (
                            <button
                              onClick={() => {
                                if (window.confirm(`Are you sure you want to deactivate "${kind.label}"?`)) {
                                  handleDeactivateEmpty(kind.id);
                                }
                              }}
                              disabled={isPending}
                              className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setMigratingId(isMigrating ? null : kind.id);
                                setEditingId(null);
                              }}
                              disabled={isPending}
                              className="text-xs font-bold text-red-500 hover:bg-red-50 px-2.5 py-1.5 rounded transition-colors cursor-pointer"
                            >
                              {isMigrating ? "Cancel" : "Deactivate"}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {isMigrating && (
                    <div className="mt-4 pt-4 border-t border-red-100 bg-red-50/50 -mx-4 -mb-4 p-4 rounded-b-lg animate-in slide-in-from-top-2">
                      <p className="text-xs text-red-800 font-medium mb-3 flex items-center gap-1.5">
                        <span>⚠️</span>
                        To deactivate "{kind.label}", you must select a new classification for its {count} existing {count === 1 ? 'node' : 'nodes'}.
                      </p>
                      
                      <div className="flex gap-2">
                        <select
                          value={targetId}
                          onChange={(e) => setTargetId(e.target.value)}
                          className="flex-1 p-2 text-sm border border-red-200 rounded focus:ring-2 focus:ring-red-500 outline-none"
                        >
                          <option value="">Select fallback kind...</option>
                          {activeKinds.filter(k => k.id !== kind.id).map(k => (
                            <option key={k.id} value={k.id}>{k.icon} {k.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleMigrate(kind.id)}
                          disabled={isPending || !targetId}
                          className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-50 cursor-pointer shadow-sm"
                        >
                          {isPending ? "Migrating..." : "Migrate & Deactivate"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* INACTIVE / DEPRECATED SECTION */}
        {inactiveKinds.length > 0 && (
          <div className="pt-8 mt-8 border-t border-gray-200">
             <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">
              Deprecated Classifications
            </h2>
            <div className="grid grid-cols-2 gap-3 opacity-60">
              {inactiveKinds.map(kind => (
                <div key={kind.id} className="bg-gray-50 border border-gray-200 rounded p-3 flex items-center gap-2 grayscale">
                  <span>{kind.icon}</span>
                  <span className="text-sm text-gray-500 line-through">{kind.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}