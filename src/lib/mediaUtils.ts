/**
 * Shared utility for extracting media formats, icons, and safe URLs
 * from the arbitrary JSONB properties of a MEDIA layer node.
 */
export function getMediaDetails(properties: Record<string, any> = {}) {
  const mimeType = properties.mimeType || '';
  const hash = properties.hash || '';

  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  const isAudio = mimeType.startsWith('audio/');
  
  // Safely fallback to the stored payload hash to determine URL/YouTube/Wikipedia formats
  const isYouTube = !!properties.youtube_id || hash.startsWith('youtube:');
  const isWikipedia = hash.startsWith('wikipedia:');
  
  // We treat Wikipedia as a web link so the UI renders the external link button
  const isWebLink = !!properties.url || hash.startsWith('http') || isWikipedia;
  
  let format = 'Document';
  let icon = '📄';
  
  if (isImage) { format = 'Image'; icon = '🖼️'; }
  else if (isVideo) { format = 'Video'; icon = '🎞️'; }
  else if (isAudio) { format = 'Audio'; icon = '🎵'; }
  else if (isYouTube) { format = 'YouTube Video'; icon = '📺'; }
  else if (isWikipedia) { format = 'Wikipedia Article'; icon = '🇼'; }
  else if (isWebLink) { format = 'Web Link'; icon = '🔗'; }
  
  const ytId = properties.youtube_id || hash.replace('youtube:', '');
  let webUrl = properties.url || properties.fileUrl || (hash.startsWith('http') ? hash : '');
  
  // Reconstruct the Wikipedia URL from the standardized hash
  if (isWikipedia) {
    const parts = hash.split(':'); // e.g., ['wikipedia', 'en', 'Abraham_Lincoln']
    if (parts.length >= 3) {
      webUrl = `https://${parts[1]}.wikipedia.org/wiki/${parts.slice(2).join(':')}`;
    }
  }
  
  return {
    format,
    icon,
    isImage,
    isVideo,
    isAudio,
    isYouTube,
    isWikipedia,
    isWebLink,
    ytId,
    webUrl
  };
}