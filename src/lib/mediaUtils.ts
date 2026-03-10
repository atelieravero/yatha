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
  
  // Safely fallback to the stored payload hash to determine URL/YouTube formats
  const isYouTube = !!properties.youtube_id || hash.startsWith('youtube:');
  const isWebLink = !!properties.url || hash.startsWith('http');
  
  let format = 'Document';
  let icon = '📄';
  
  if (isImage) { format = 'Image'; icon = '🖼️'; }
  else if (isVideo) { format = 'Video'; icon = '🎞️'; }
  else if (isAudio) { format = 'Audio'; icon = '🎵'; }
  else if (isWebLink && !isYouTube) { format = 'Web Link'; icon = '🔗'; }
  else if (isYouTube) { format = 'YouTube Video'; icon = '📺'; }
  
  const ytId = properties.youtube_id || hash.replace('youtube:', '');
  const webUrl = properties.url || properties.fileUrl || (hash.startsWith('http') ? hash : '');
  
  return {
    format,
    icon,
    isImage,
    isVideo,
    isAudio,
    isYouTube,
    isWebLink,
    ytId,
    webUrl
  };
}