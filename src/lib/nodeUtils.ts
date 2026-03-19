import { getMediaDetails } from "@/lib/mediaUtils";

/**
 * Consistently resolves the display icon, label, and custom avatar 
 * for any node based on its 3-Layer architecture and taxonomy definitions.
 */
export function getNodeDisplay(node: any, activeKinds: any[] = []) {
  let icon = '🟣';
  let kindLabel = 'Concept';
  let avatarUrl = null;

  if (!node) return { icon, kindLabel, avatarUrl };

  // 1. Resolve custom avatars first (Base64 from Postgres JSONB)
  if (node.properties?.avatar_base64) {
    avatarUrl = node.properties.avatar_base64;
  } else if (node.properties?.thumbnail_base64) {
    avatarUrl = node.properties.thumbnail_base64;
  }

  // 2. Resolve taxonomic fallbacks
  // Graceful fallback logic to safely support older nodes from the Alpha "INSTANCE" layer
  const isPhysical = node.layer === 'PHYSICAL' || (node.layer === 'INSTANCE' && node.kind?.startsWith('PHYSICAL'));
  const isMedia = node.layer === 'MEDIA' || (node.layer === 'INSTANCE' && !node.kind?.startsWith('PHYSICAL'));

  if (isPhysical) {
    icon = node.kind === 'PHYSICAL_CONTAINER' ? '🗃️' : '📦';
    kindLabel = node.kind === 'PHYSICAL_CONTAINER' ? 'Physical Container' : 'Physical Item';
  } else if (isMedia) {
    const media = getMediaDetails(node.properties || {});
    icon = media.icon;
    kindLabel = media.format;

    // Legacy Migration Fallback: If properties aren't loaded, rely strictly on the old flat "kind"
    if (!node.properties?.hash && node.kind) {
       if (node.kind === 'IMAGE') { icon = '🖼️'; kindLabel = 'Image'; }
       else if (node.kind === 'VIDEO') { icon = '🎞️'; kindLabel = 'Video'; }
       else if (node.kind === 'AUDIO') { icon = '🎵'; kindLabel = 'Audio'; }
       else if (node.kind === 'DOCUMENT') { icon = '📄'; kindLabel = 'Document'; }
       else if (node.kind === 'YOUTUBE_VIDEO') { icon = '📺'; kindLabel = 'YouTube Video'; }
       else if (node.kind === 'WEB_LINK') { icon = '🔗'; kindLabel = 'Web Link'; }
    }
  } else {
    // Identity Layer (Abstract Concepts)
    const kindDef = activeKinds.find((k: any) => k.id === node.kind);
    if (kindDef) {
      icon = kindDef.icon;
      kindLabel = kindDef.label;
    }
  }

  return { icon, kindLabel, avatarUrl };
}