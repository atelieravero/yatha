/**
 * YATHĀ IMAGE UTILITIES
 * Client-side canvas operations for generating tiny Base64 UI avatars.
 */

const THUMBNAIL_SIZE = 256; // 256x256px for crisp 3x Retina display
const EXPORT_QUALITY = 0.7; // 70% JPEG compression to keep the DB footprint tiny

/**
 * Automatically generates a center-cropped, 256x256 Base64 thumbnail 
 * from a raw File object without requiring user interaction.
 * * @param file The raw File object (from a drag/drop or input)
 * @returns A Promise resolving to a Base64 string (image/jpeg)
 */
export async function generateAutoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    // Safety check: Ensure it's actually an image before attempting canvas math
    if (!file.type.startsWith('image/')) {
      return reject(new Error("File is not an image."));
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // 1. Create the off-screen canvas
      const canvas = document.createElement("canvas");
      canvas.width = THUMBNAIL_SIZE;
      canvas.height = THUMBNAIL_SIZE;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        return reject(new Error("Could not initialize 2D canvas context."));
      }

      // Fill background with white in case of transparent PNGs (JPEG doesn't support alpha)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);

      // 2. Calculate "object-fit: cover" center-crop math
      const scale = Math.max(THUMBNAIL_SIZE / img.naturalWidth, THUMBNAIL_SIZE / img.naturalHeight);
      
      const drawWidth = img.naturalWidth * scale;
      const drawHeight = img.naturalHeight * scale;
      
      // Calculate offsets to center the scaled image
      const offsetX = (THUMBNAIL_SIZE - drawWidth) / 2;
      const offsetY = (THUMBNAIL_SIZE - drawHeight) / 2;

      // 3. Draw the cropped image onto the canvas
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);

      // 4. Export as a highly compressed JPEG
      const base64 = canvas.toDataURL("image/jpeg", EXPORT_QUALITY);
      
      // Cleanup memory
      URL.revokeObjectURL(objectUrl);
      resolve(base64);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image into canvas for thumbnail generation."));
    };

    // Trigger the load
    img.src = objectUrl;
  });
}