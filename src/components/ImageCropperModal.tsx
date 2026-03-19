"use client";

import { useState, useEffect, useRef } from "react";

interface ImageCropperModalProps {
  imageUrl: string;
  maskShape?: "circle" | "square";
  isSaving?: boolean;
  onClose: () => void;
  onConfirm: (base64: string) => void;
}

export default function ImageCropperModal({
  imageUrl,
  maskShape = "circle",
  isSaving = false,
  onClose,
  onConfirm,
}: ImageCropperModalProps) {
  // Constants for export quality (matches the Architecture Spec)
  const CONTAINER_SIZE = 300; // Visual UI size
  const EXPORT_SIZE = 256;    // Final Base64 Resolution (256x256 for 3x Retina support)

  const [isLoading, setIsLoading] = useState(true);
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [baseDimensions, setBaseDimensions] = useState({ width: CONTAINER_SIZE, height: CONTAINER_SIZE });
  const [error, setError] = useState<string | null>(null);

  // Transform State
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  
  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 1. Load the image and calculate its base "Cover" dimensions
  useEffect(() => {
    setIsLoading(true);
    const img = new Image();
    
    // CRUCIAL: Required to prevent the Canvas from becoming "Tainted" by CORS when loading from R2
    img.crossOrigin = "anonymous"; 

    img.onload = () => {
      const aspect = img.naturalWidth / img.naturalHeight;
      // Replicate `object-fit: cover` logic exactly
      if (aspect > 1) {
        setBaseDimensions({ width: CONTAINER_SIZE * aspect, height: CONTAINER_SIZE });
      } else {
        setBaseDimensions({ width: CONTAINER_SIZE, height: CONTAINER_SIZE / aspect });
      }
      setImageObj(img);
      setIsLoading(false);
    };

    img.onerror = () => {
      setError("Failed to load secure image for cropping.");
      setIsLoading(false);
    };

    img.src = imageUrl;
  }, [imageUrl]);

  // 2. Boundary Clamping: Prevent panning the image completely out of the frame
  useEffect(() => {
    const maxX = Math.max(0, (baseDimensions.width * zoom - CONTAINER_SIZE) / 2);
    const maxY = Math.max(0, (baseDimensions.height * zoom - CONTAINER_SIZE) / 2);
    
    setPosition(prev => ({
      x: Math.min(Math.max(prev.x, -maxX), maxX),
      y: Math.min(Math.max(prev.y, -maxY), maxY)
    }));
  }, [zoom, baseDimensions]);

  // 3. Pointer Event Handlers (Supports both Mouse and Touch)
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    
    let newX = e.clientX - dragStart.x;
    let newY = e.clientY - dragStart.y;

    const maxX = Math.max(0, (baseDimensions.width * zoom - CONTAINER_SIZE) / 2);
    const maxY = Math.max(0, (baseDimensions.height * zoom - CONTAINER_SIZE) / 2);

    newX = Math.min(Math.max(newX, -maxX), maxX);
    newY = Math.min(Math.max(newY, -maxY), maxY);

    setPosition({ x: newX, y: newY });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // 4. The Export Logic (Canvas Math)
  const handleConfirm = () => {
    if (!imageObj) return;

    const canvas = document.createElement("canvas");
    canvas.width = EXPORT_SIZE;
    canvas.height = EXPORT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Scale context down from the 300px UI container to the 256px export requirement
    const scaleFactor = EXPORT_SIZE / CONTAINER_SIZE;
    ctx.scale(scaleFactor, scaleFactor);

    // Fill background with white in case of transparent PNGs (JPEG doesn't support alpha)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CONTAINER_SIZE, CONTAINER_SIZE);

    // Translate to the center of the canvas to apply transformations from the origin
    ctx.translate(CONTAINER_SIZE / 2, CONTAINER_SIZE / 2);
    
    // Apply user panning & zoom
    ctx.translate(position.x, position.y);
    ctx.scale(zoom, zoom);
    
    // Draw the image exactly as it was laid out in the "Cover" base calculation
    ctx.drawImage(
      imageObj,
      -baseDimensions.width / 2,
      -baseDimensions.height / 2,
      baseDimensions.width,
      baseDimensions.height
    );

    // Export as 70% quality JPEG to keep Database Base64 JSON footprints tiny (~15KB)
    const base64 = canvas.toDataURL("image/jpeg", 0.7);
    onConfirm(base64);
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-gray-900/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-zinc-950 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex items-center justify-between bg-gray-50/50 dark:bg-zinc-900/50">
          <h2 className="font-bold text-gray-900 dark:text-zinc-100 flex items-center gap-2">
            <span>✂️</span> Frame Avatar
          </h2>
          <button 
            onClick={onClose} 
            disabled={isSaving} 
            className="text-gray-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-6 flex flex-col items-center bg-gray-100 dark:bg-zinc-900">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-gray-400 dark:text-zinc-500 gap-3">
              <span className="text-3xl animate-spin text-blue-500">🌀</span>
              <p className="text-xs font-bold uppercase tracking-widest">Loading High-Res...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-red-500 gap-3">
              <span className="text-3xl">⚠️</span>
              <p className="text-xs font-medium text-center max-w-[200px]">{error}</p>
            </div>
          ) : (
            <div className="relative shadow-inner bg-gray-200 dark:bg-zinc-800 rounded-md border border-gray-300 dark:border-zinc-700">
              
              {/* THE INTERACTIVE CROPPING WINDOW */}
              <div
                className="relative overflow-hidden touch-none"
                style={{ 
                  width: CONTAINER_SIZE, 
                  height: CONTAINER_SIZE, 
                  cursor: isDragging ? "grabbing" : "grab" 
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
              >
                {/* The Image (Positioned via center alignment) */}
                <div
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: baseDimensions.width,
                    height: baseDimensions.height,
                    transform: `translate(-50%, -50%)`,
                    pointerEvents: "none",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    crossOrigin="anonymous"
                    alt="Crop Source"
                    draggable={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
                      transformOrigin: "center",
                    }}
                  />
                </div>

                {/* THE MASK OVERLAY (SVG ensures perfect cutout) */}
                <div className="absolute inset-0 pointer-events-none">
                  <svg width={CONTAINER_SIZE} height={CONTAINER_SIZE} xmlns="http://www.w3.org/2000/svg">
                    <defs>
                      <mask id="crop-cutout">
                        <rect width={CONTAINER_SIZE} height={CONTAINER_SIZE} fill="white" />
                        {maskShape === "circle" ? (
                          <circle cx={CONTAINER_SIZE / 2} cy={CONTAINER_SIZE / 2} r={CONTAINER_SIZE / 2} fill="black" />
                        ) : (
                          // Square mask (slight inset for visual guidance)
                          <rect x="0" y="0" width={CONTAINER_SIZE} height={CONTAINER_SIZE} fill="black" />
                        )}
                      </mask>
                    </defs>
                    <rect width={CONTAINER_SIZE} height={CONTAINER_SIZE} fill="rgba(0,0,0,0.5)" mask="url(#crop-cutout)" />
                  </svg>
                </div>
                
                {/* GUIDELINES (Rule of Thirds) */}
                <div className="absolute inset-0 pointer-events-none flex flex-col justify-evenly opacity-40">
                  <div className="w-full h-px bg-white" />
                  <div className="w-full h-px bg-white" />
                </div>
                <div className="absolute inset-0 pointer-events-none flex justify-evenly opacity-40">
                  <div className="h-full w-px bg-white" />
                  <div className="h-full w-px bg-white" />
                </div>
              </div>

              {/* SLIDER CONTROLS */}
              <div className="mt-6 px-2 flex items-center gap-3">
                <span className="text-gray-500 dark:text-zinc-400 text-sm">➖</span>
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  disabled={isSaving}
                  className="flex-1 accent-blue-600 dark:accent-blue-500 h-1.5 bg-gray-300 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-gray-500 dark:text-zinc-400 text-sm">➕</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || isSaving || !!error}
            className="px-6 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-md text-xs font-bold uppercase tracking-widest shadow-sm hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isSaving ? "Saving Avatar..." : "Confirm & Pin"}
          </button>
        </div>
      </div>
    </div>
  );
}