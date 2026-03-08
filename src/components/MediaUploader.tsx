"use client";

import { useState } from "react";
import { getUploadTicket, attachFileToNode, createDigitalArtifact, checkDuplicateArtifact, linkExistingArtifact } from "@/app/actions";

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
  const [tab, setTab] = useState<'FILE' | 'LINK'>('FILE');
  
  const [file, setFile] = useState<File | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState("");
  
  // De-duplication State
  const [duplicateFound, setDuplicateFound] = useState<{id: string, label: string, kind: string} | null>(null);
  
  const [role, setRole] = useState("");
  const [isDerived, setIsDerived] = useState(false);
  const [derivedFromId, setDerivedFromId] = useState("");
  
  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);

  const mode = identityId ? "MINT_NEW" : "DIRECT_ATTACH";
  const targetId = identityId || nodeId;

  // Automatically reset states when modal closes
  const handleClose = () => {
    setIsOpen(false);
    setFile(null);
    setLinkUrl("");
    setDuplicateFound(null);
    setStatus("");
    setIsDragging(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setDuplicateFound(null);
    
    e.target.value = '';

    if (mode === "DIRECT_ATTACH") processUpload(selected, null);
    else setIsOpen(true);
  };

  // --- Drag & Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;
    
    setFile(droppedFile);
    setDuplicateFound(null);
    setTab('FILE');
    
    // If modal isn't open and we are in direct attach, upload immediately!
    if (!isOpen && mode === "DIRECT_ATTACH") {
      processUpload(droppedFile, null);
    } else {
      setIsOpen(true);
    }
  };

  // URL Normalizer & Hash Generator
  const processLink = async () => {
    if (!linkUrl.trim()) return;
    setIsUploading(true);
    setStatus("Analyzing URL...");
    
    let kind = 'WEB_LINK';
    let hash = linkUrl.trim();
    let label = linkUrl.trim();

    // YouTube Normalizer: Aggressively strips ?t=1s, &feature=share, etc.
    const ytMatch = linkUrl.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    if (ytMatch && ytMatch[1]) {
      kind = 'YOUTUBE_VIDEO';
      hash = `youtube:${ytMatch[1]}`;
      label = `YouTube Video (${ytMatch[1]})`;
    }

    // DE-DUPE CHECK
    const existing = await checkDuplicateArtifact(hash);
    if (existing) {
      setDuplicateFound(existing);
      setIsUploading(false);
      return;
    }

    setStatus("Saving link...");
    await createDigitalArtifact(
      targetId!, label, kind, 
      { fileUrl: linkUrl.trim(), mimeType: 'text/html', fileSize: 0, hash },
      role || undefined,
      isDerived ? derivedFromId : undefined
    );
    
    handleClose();
    if (typeof window !== 'undefined') window.location.reload();
  };

  const processUpload = async (fileToUpload: File, currentRole: string | null) => {
    if (!targetId) return;
    
    try {
      setIsUploading(true);

      setStatus("1. Calculating SHA-256 hash...");
      const arrayBuffer = await fileToUpload.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setStatus("Checking for duplicates...");
      const existing = await checkDuplicateArtifact(hashHex);
      if (existing) {
        setDuplicateFound(existing);
        setIsUploading(false);
        return;
      }

      setStatus("2. Requesting secure ticket...");
      const { uploadUrl, fileUrl } = await getUploadTicket(fileToUpload.name, fileToUpload.type);

      setStatus("3. Uploading securely...");
      if (uploadUrl !== 'mock-url') {
         const uploadResponse = await fetch(uploadUrl, { method: "PUT", body: fileToUpload, headers: { "Content-Type": fileToUpload.type } });
         if (!uploadResponse.ok) throw new Error("Storage rejected the file.");
      }

      setStatus("4. Asserting to knowledge graph...");
      if (mode === "DIRECT_ATTACH") {
        await attachFileToNode(targetId, fileUrl, fileToUpload.type, fileToUpload.size, hashHex);
      } else {
        const kind = fileToUpload.type.startsWith('image/') ? 'IMAGE' :
                     fileToUpload.type.startsWith('video/') ? 'VIDEO' :
                     fileToUpload.type.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT';
                     
        await createDigitalArtifact(
          targetId, fileToUpload.name, kind, 
          { fileUrl, mimeType: fileToUpload.type, fileSize: fileToUpload.size, hash: hashHex },
          currentRole || undefined, isDerived ? derivedFromId : undefined
        );
      }

      handleClose();
      if (typeof window !== 'undefined') window.location.reload();

    } catch (error) {
      console.error(error);
      setStatus("Upload failed. Check console.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!duplicateFound || !targetId) return;
    setIsUploading(true);
    setStatus("Linking existing artifact...");
    await linkExistingArtifact(targetId, duplicateFound.id, role || undefined);
    handleClose();
    if (typeof window !== 'undefined') window.location.reload();
  };

  const renderForm = () => (
    <div className="flex flex-col gap-4 text-sm text-left">
      <div className="font-medium text-gray-900 pb-3 border-b border-gray-100 flex items-center justify-between">
        <span className="flex items-center gap-2"><span>✨</span> Mint Digital Artifact</span>
        <button onClick={handleClose} disabled={isUploading} className="text-gray-400 hover:text-gray-900 transition-colors cursor-pointer">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex bg-gray-100 p-1 rounded-md mb-2">
        <button onClick={() => { setTab('FILE'); setDuplicateFound(null); }} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors cursor-pointer ${tab === 'FILE' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Upload File</button>
        <button onClick={() => { setTab('LINK'); setDuplicateFound(null); }} className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-widest rounded transition-colors cursor-pointer ${tab === 'LINK' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Web Link</button>
      </div>

      {/* Payload Input */}
      {tab === 'FILE' ? (
        <div 
          onDragOver={handleDragOver} 
          onDragLeave={handleDragLeave} 
          onDrop={handleDrop}
        >
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Selected File</label>
          <div className={`p-3 rounded border font-mono text-xs text-gray-600 truncate flex items-center justify-between transition-colors ${isDragging ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-200'}`}>
            <span>{file ? `📄 ${file.name}` : (isDragging ? 'Drop file here...' : 'No file selected.')}</span>
            <label className="text-blue-600 font-bold hover:underline cursor-pointer">
              {file ? 'Change...' : 'Browse...'}
              <input type="file" className="hidden" onChange={handleFileSelect} />
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
            onChange={(e) => { setLinkUrl(e.target.value); setDuplicateFound(null); }}
            className="w-full p-2 text-xs border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 outline-none shadow-sm"
          />
        </div>
      )}

      {/* Context (Only shown on Identity pages where we mint a new node) */}
      {mode === 'MINT_NEW' && !duplicateFound && (
        <div className="space-y-4 animate-in fade-in">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Role / Context (Optional)</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} disabled={isUploading} className="w-full p-2 text-xs border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Generic Attachment --</option>
              <option value="digital copy">Digital Copy (Exact replication)</option>
              <option value="transcript">Transcript / Translation</option>
              <option value="primary subject">Primary Subject</option>
              <option value="thumbnail">Thumbnail</option>
              <option value="evidence">Evidence / Mentions</option>
            </select>
          </div>

          {physicalHoldings.length > 0 && tab === 'FILE' && (
            <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200/50 transition-colors">
              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer mb-2">
                <input type="checkbox" checked={isDerived} onChange={(e) => setIsDerived(e.target.checked)} className="rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer" />
                Digitized from a physical holding?
              </label>
              {isDerived && (
                <select value={derivedFromId} onChange={(e) => setDerivedFromId(e.target.value)} className="w-full p-2 text-xs border border-amber-200 rounded focus:outline-none focus:ring-2 focus:ring-amber-500">
                  <option value="">Select source material...</option>
                  {physicalHoldings.map(h => <option key={h.id} value={h.id}>{h.label}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      )}

      {/* Duplicate Warning Engine */}
      {duplicateFound ? (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg animate-in slide-in-from-top-2 shadow-sm">
          <p className="text-sm font-medium text-amber-800 mb-1 flex items-center gap-2"><span>⚠️</span> Identical Artifact Found</p>
          <p className="text-xs text-amber-700 mb-3 leading-relaxed">
            This exact {tab === 'FILE' ? 'file' : 'link'} already exists in the graph as <strong>"{duplicateFound.label}"</strong>. To prevent duplication, you can link the existing artifact to this concept instead.
          </p>
          <button onClick={handleLinkExisting} disabled={isUploading} className="w-full py-2 bg-amber-600 text-white text-xs font-bold uppercase tracking-widest rounded hover:bg-amber-700 transition-colors shadow-sm cursor-pointer disabled:opacity-50">
            {isUploading ? "Linking..." : "Link Existing Artifact"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => tab === 'FILE' ? processUpload(file!, role) : processLink()}
            disabled={isUploading || (tab === 'FILE' && !file) || (tab === 'LINK' && !linkUrl) || (isDerived && !derivedFromId)}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm cursor-pointer text-xs"
          >
            {isUploading ? "Processing..." : "Mint & Link Artifact"}
          </button>
        </div>
      )}
      
      {status && !duplicateFound && (
        <div className="text-[10px] text-blue-600 font-mono text-center font-bold mt-1 animate-pulse tracking-widest uppercase">
          {status}
        </div>
      )}
    </div>
  );

  // ============================================================================
  // RENDER MODES
  // ============================================================================

  // Mode 1: Compact Button triggering a Modal Form
  if (asButton) {
    return (
      <>
        <button onClick={() => setIsOpen(true)} className="text-[10px] font-bold uppercase tracking-widest bg-white hover:bg-gray-50 text-gray-600 px-3 py-1.5 rounded transition-colors cursor-pointer shadow-sm border border-gray-200 flex items-center gap-1.5">
          <span>+ Add Artifact</span>
        </button>
        
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/30 backdrop-blur-sm p-4 animate-in fade-in duration-200" onDragOver={e => { e.preventDefault(); e.stopPropagation(); }} onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 duration-200">
              {renderForm()}
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback for empty dropzone (Main Instance page)
  return (
    <div 
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative group cursor-pointer ${isDragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}`} 
      onClick={() => setIsOpen(true)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className={`flex flex-col items-center gap-1 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-600'}`}>
        <span className="text-2xl mb-2">{isDragging ? '📥' : '☁️'}</span>
        <span className="font-medium">{isDragging ? 'Drop file to upload!' : 'Click or drag media here'}</span>
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