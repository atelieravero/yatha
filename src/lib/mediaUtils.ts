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

/**
 * Parses raw URLs to standardize hashes and generate clean fallback labels.
 * Crucial for deduplication and stripping tracking parameters.
 */
export function standardizeUrlMetadata(rawUrl: string) {
  const trimmedUrl = rawUrl.trim();
  let cleanUrl = trimmedUrl;
  let hash = trimmedUrl;

  const ytMatch = trimmedUrl.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  const wikiMatch = trimmedUrl.match(/https?:\/\/([a-z\-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^#?]+)/);

  if (ytMatch && ytMatch[1]) {
    cleanUrl = `https://youtube.com/watch?v=${ytMatch[1]}`;
    hash = `youtube:${ytMatch[1]}`;
  } else if (wikiMatch && wikiMatch[1] && wikiMatch[2]) {
    cleanUrl = `https://${wikiMatch[1]}.wikipedia.org/wiki/${wikiMatch[2]}`;
    hash = `wikipedia:${wikiMatch[1]}:${wikiMatch[2]}`;
  }

  return { cleanUrl, hash };
}

/**
 * Cleans up common bot-blocked skeleton titles (like "- YouTube" or "Access Denied").
 * Returns an empty string if the title is useless, allowing the UI to gracefully
 * fallback to the standardized URL instead.
 */
export function cleanFetchedTitle(title: string | null | undefined): string {
  if (!title) return "";
  
  let cleaned = title.trim();
  
  // Wipe out titles that are literally just bot-blocked skeleton responses
  if (cleaned === '- YouTube' || cleaned === 'YouTube' || cleaned === 'Access Denied') {
    return "";
  } 
  
  // Strip the suffix from valid YouTube video titles
  if (cleaned.endsWith(' - YouTube')) {
    cleaned = cleaned.replace(' - YouTube', '').trim();
  }
  
  return cleaned;
}