"use client";

import { useState } from "react";
import { getUploadTicket, attachFileToNode, createDigitalArtifact, checkDuplicateArtifact, linkExistingArtifact, createNode } from "@/app/actions";

export default function MediaUploader({ 
  nodeId, 
  identityId,
  physicalHoldings = [],
  asButton = false
}: { 
  nodeId?: string; 
  identityId?: string;
  physicalHoldings?: { id: string, label: string }[];
  asButton?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'INPUT' | 'ANALYZING' | 'CONFIRM' | 'DUPLICATE' | 'UPLOADING'>('INPUT');
  const [tab, setTab] = useState<'FILE' | 'LINK'>('FILE');
  
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [status, setStatus] = useState("");
  
  // Extracted Payload
  const [payload, setPayload] = useState<{ hash: string, kind: string, mimeType: string, fileSize: number } | null>(null);
  
  // Confirmation State
  const [label, setLabel] = useState("");
  const [role, setRole] = useState("");
  const [isDerived, setIsDerived] = useState(false);
  const [derivedFromId, setDerivedFromId] = useState("");
  
  const [duplicateFound, setDuplicateFound] = useState<{id: string, label: string, kind: string} | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // --------------------------------------------------------------------------
  // 3-MODE ROUTING LOGIC
  // --------------------------------------------------------------------------
  let mode: 'CONTEXTUAL' | 'DIRECT_ATTACH' | 'GLOBAL' = 'GLOBAL';
  if (identityId) mode = 'CONTEXTUAL';     // Added from a Concept or Physical Item tab
  else if (nodeId) mode = 'DIRECT_ATTACH'; // Uploading to an empty, existing Media Node

  const handleClose = () => {
    setIsOpen(false);
    setStep('INPUT');
    setFile(null);
    setLinkUrl("");
    setDuplicateFound(null);
    setStatus("");
    setIsDragging(false);
    setLabel("");
    setPayload(null);
  };

  // --- Step 1: Input & Analysis (FILE) ---
  const analyzeFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setStep('ANALYZING');
    setStatus("Calculating payload hash...");

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setStatus("Checking for exact duplicates...");
      const existing = await checkDuplicateArtifact(hashHex);
      if (existing) {
        setDuplicateFound(existing);
        setStep('DUPLICATE');
        return;
      }

      const kind = selectedFile.type.startsWith('image/') ? 'IMAGE' :
                   selectedFile.type.startsWith('video/') ? 'VIDEO' :
                   selectedFile.type.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT';

      setPayload({ hash: hashHex, kind, mimeType: selectedFile.type, fileSize: selectedFile.size });
      setLabel(selectedFile.name);
      setStep('CONFIRM');
    } catch (e) {
      console.error(e);
      setStatus("Analysis failed.");
      setTimeout(() => setStep('INPUT'), 2000);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      e.target.value = '';
      analyzeFile(selected);
    }
  };

  // --- Step 1: Input & Analysis (LINK) ---
  const analyzeLink = async () => {
    if (!linkUrl.trim()) return;
    setStep('ANALYZING');
    setStatus("Analyzing URL parameters...");

    let kind = 'WEB_LINK';
    let hash = linkUrl.trim();
    let defaultLabel = linkUrl.trim();

    // Aggressively strip parameters to isolate the YouTube video ID
    const ytMatch = linkUrl.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      kind = 'YOUTUBE_VIDEO';
      hash = `youtube:${ytMatch[1]}`;
      defaultLabel = `YouTube Video (${ytMatch[1]})`;
    }

    const existing = await checkDuplicateArtifact(hash);
    if (existing) {
      setDuplicateFound(existing);
      setStep('DUPLICATE');
      return;
    }

    setPayload({ hash, kind, mimeType: 'text/html', fileSize: 0 });
    setLabel(defaultLabel);
    setStep('CONFIRM');
  };

  // --- Step 2: Execution (Upload & Graph Mutation) ---
  const executeUpload = async () => {
    if (!payload || (mode !== 'DIRECT_ATTACH' && !label.trim())) return;
    setStep('UPLOADING');

    try {
      let finalFileUrl = payload.hash; // Safe fallback for generic links

      if (tab === 'FILE' && file) {
        setStatus("Requesting secure upload ticket...");
        const { uploadUrl, fileUrl } = await getUploadTicket(file.name, file.type);
        finalFileUrl = fileUrl;

        if (uploadUrl !== 'mock-url') {
           setStatus("Uploading securely to R2...");
           const uploadResponse = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
           if (!uploadResponse.ok) throw new Error("Storage rejected the file.");
        }
      }

      setStatus("Asserting to knowledge graph...");

      if (mode === "CONTEXTUAL" && identityId) {
        await createDigitalArtifact(
          identityId, label.trim(), payload.kind, 
          { fileUrl: finalFileUrl, mimeType: payload.mimeType, fileSize: payload.fileSize, hash: payload.hash },
          role || undefined, isDerived ? derivedFromId : undefined
        );
        handleClose();
        if (typeof window !== 'undefined') window.location.reload();
      } 
      else if (mode === "DIRECT_ATTACH" && nodeId) {
        const actualUrl = tab === 'LINK' ? linkUrl.trim() : finalFileUrl;
        await attachFileToNode(nodeId, actualUrl, payload.mimeType, payload.fileSize, payload.hash);
        handleClose();
        if (typeof window !== 'undefined') window.location.reload();
      }
      else {
        // GLOBAL UPLOAD (Mint a new orphaned node and go to it)
        const actualUrl = tab === 'LINK' ? linkUrl.trim() : finalFileUrl;
        const newId = await createNode(label.trim(), "INSTANCE", payload.kind);
        await attachFileToNode(newId, actualUrl, payload.mimeType, payload.fileSize, payload.hash);
        handleClose();
        if (typeof window !== 'undefined') window.location.href = `/?node=${newId}`;
      }

    } catch (error) {
      console.error(error);
      setStatus("Upload failed. Check console.");
      setTimeout(() => setStep('CONFIRM'), 3000);
    }
  };

  const handleDuplicateAction = async () => {
    if (!duplicateFound) return;
    
    if (mode === "CONTEXTUAL" && identityId) {
      setStep('UPLOADING');
      setStatus("Linking existing artifact...");
      await linkExistingArtifact(identityId, duplicateFound.id, role || undefined);
      handleClose();
      if (typeof window !== 'undefined') window.location.reload();
    } else {
      // GLOBAL or DIRECT_ATTACH: Navigate to the duplicate so the user isn't stuck with an empty shell
      handleClose();
      if (typeof window !== 'undefined') window.location.href = `/?node=${duplicateFound.id}`;
    }
  };

  // --- Drag & Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  
  const handleDropForm = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) analyzeFile(droppedFile);
  };

  const handleDropOuter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      setIsOpen(true);
      setTab('FILE');
      analyzeFile(droppedFile);
    }
  };

  const renderForm = () => (
    <div className="flex flex-col gap-4 text-sm text-left">
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span>{mode === 'GLOBAL' ? '☁️' : '✨'}</span> 
          {mode === 'GLOBAL' ? 'Upload Global Media' : mode === 'CONTEXTUAL' ? 'Mint Digital Artifact' : 'Attach Payload to Node'}
        </span>
        <button onClick={handleClose} disabled={step === 'UPLOADING'} className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">✕</button>
      </div>

      {step === 'INPUT' && (
        <div className="animate-in fade-in">
          <div className="flex bg-gray-100 p-1 rounded-md mb-4">
            <button onClick={() => setTab('FILE')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors cursor-pointer ${tab === 'FILE' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Upload File</button>
            <button onClick={() => setTab('LINK')} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors cursor-pointer ${tab === 'LINK' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Web Link</button>
          </div>

          {tab === 'FILE' ? (
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDropForm}>
              <div className={`p-6 rounded-lg border-2 border-dashed text-center transition-colors cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`}>
                <input type="file" className="hidden" id="file-upload" onChange={handleFileSelect} />
                <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-2">
                  <span className="text-3xl mb-1">{isDragging ? '📥' : '📄'}</span>
                  <span className="text-xs text-gray-600 font-medium">{isDragging ? 'Drop it here!' : 'Click to browse or drag file here'}</span>
                </label>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">URL (YouTube or Generic)</label>
              <input 
                type="url" 
                placeholder="https://"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none shadow-sm mb-3"
              />
              <button onClick={analyzeLink} disabled={!linkUrl.trim()} className="w-full py-2 bg-blue-600 text-white rounded font-bold text-xs uppercase tracking-widest disabled:opacity-50 shadow-sm cursor-pointer hover:bg-blue-700 transition-colors">
                Analyze Link →
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'ANALYZING' && (
        <div className="py-10 text-center animate-in fade-in flex flex-col items-center gap-4">
          <span className="text-4xl animate-spin">⏳</span>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest animate-pulse">{status}</p>
        </div>
      )}

      {step === 'DUPLICATE' && duplicateFound && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg animate-in slide-in-from-bottom-2 shadow-sm">
          <p className="text-sm font-medium text-amber-800 mb-1 flex items-center gap-2"><span>⚠️</span> Identical Artifact Found</p>
          <p className="text-xs text-amber-700 mb-4 leading-relaxed">
            This exact {tab === 'FILE' ? 'file' : 'link'} already exists in the graph as <strong>"{duplicateFound.label}"</strong>. 
            {mode === 'DIRECT_ATTACH' && " You cannot attach a duplicate payload to an empty node."}
          </p>
          <button onClick={handleDuplicateAction} className="w-full py-2 bg-amber-600 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-amber-700 transition-colors shadow-sm cursor-pointer">
            {mode === 'CONTEXTUAL' ? "Link Existing Artifact" : "Focus Existing Artifact"}
          </button>
          <button onClick={() => setStep('INPUT')} className="w-full py-2 mt-2 text-amber-700 text-xs font-bold hover:bg-amber-100 rounded transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      )}

      {step === 'CONFIRM' && payload && (
        <div className="space-y-4 animate-in slide-in-from-right-2">
          {mode !== 'DIRECT_ATTACH' && (
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Artifact Title</label>
              <input 
                type="text" 
                value={label} 
                onChange={e => setLabel(e.target.value)} 
                className="w-full p-2 text-sm border border-gray-200 rounded font-medium text-gray-900 focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
              />
            </div>
          )}

          {mode === 'CONTEXTUAL' && (
            <div className="space-y-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Role / Context (Optional)</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full p-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">-- Generic Attachment --</option>
                  <option value="digital copy">Digital Copy (Exact replication)</option>
                  <option value="transcript">Transcript / Translation</option>
                  <option value="primary subject">Primary Subject</option>
                  <option value="thumbnail">Thumbnail</option>
                  <option value="evidence">Evidence / Mentions</option>
                </select>
              </div>

              {physicalHoldings.length > 0 && tab === 'FILE' && (
                <div className="pt-2 border-t border-gray-200">
                  <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer mb-2">
                    <input type="checkbox" checked={isDerived} onChange={(e) => setIsDerived(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    Digitized from a physical holding?
                  </label>
                  {isDerived && (
                    <select value={derivedFromId} onChange={(e) => setDerivedFromId(e.target.value)} className="w-full p-2 text-xs border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50/30">
                      <option value="">Select source material...</option>
                      {physicalHoldings.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                    </select>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={() => setStep('INPUT')} className="px-4 py-2 text-gray-500 text-xs font-bold hover:text-gray-800 transition-colors cursor-pointer">Back</button>
            <button onClick={executeUpload} disabled={mode !== 'DIRECT_ATTACH' && !label.trim()} className="flex-1 py-2 bg-blue-600 text-white rounded text-xs font-bold uppercase tracking-widest hover:bg-blue-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50">
              {mode === 'CONTEXTUAL' ? 'Mint & Link' : mode === 'GLOBAL' ? 'Mint Global Artifact' : 'Attach Payload'}
            </button>
          </div>
        </div>
      )}

      {step === 'UPLOADING' && (
        <div className="py-8 text-center animate-in fade-in flex flex-col items-center gap-3">
          <span className="text-3xl animate-spin text-blue-600">🌀</span>
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">{status}</p>
        </div>
      )}
    </div>
  );

  // ============================================================================
  // RENDER MODES
  // ============================================================================

  // Mode 1: Compact Button triggering a Modal Form
  if (asButton || mode === 'GLOBAL') {
    return (
      <>
        {asButton && (
          <button onClick={() => setIsOpen(true)} className="text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border border-gray-200 flex items-center gap-1.5">
            <span>+ Add Artifact</span>
          </button>
        )}
        
        {(isOpen || mode === 'GLOBAL') && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200 text-gray-900">
              {renderForm()}
            </div>
          </div>
        )}
      </>
    );
  }

  // Mode 2: Fallback empty dropzone for an unattached Media Node (DIRECT_ATTACH)
  return (
    <div 
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative group cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`} 
      onClick={() => setIsOpen(true)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDropOuter}
    >
      <div className={`flex flex-col items-center gap-1 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
        <span className="text-3xl mb-2">{isDragging ? '📥' : '☁️'}</span>
        <span className="font-medium text-sm">{isDragging ? 'Drop file to begin analysis!' : 'Click or drag media here to attach'}</span>
      </div>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200 cursor-default" onClick={e => e.stopPropagation()} onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200 text-gray-900">
            {renderForm()}
          </div>
        </div>
      )}
    </div>
  );
}