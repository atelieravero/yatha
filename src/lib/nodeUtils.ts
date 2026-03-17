import { getMediaDetails } from "@/lib/mediaUtils";

/**
 * Consistently resolves the display icon and label for any node
 * based on its 3-Layer architecture and taxonomy definitions.
 */
export function getNodeDisplay(node: any, activeKinds: any[] = []) {
  let icon = '🟣';
  let kindLabel = 'Concept';

  if (!node) return { icon, kindLabel };

  if (node.layer === 'PHYSICAL') {
    icon = '📦';
    kindLabel = 'Physical Item';
  } else if (node.layer === 'MEDIA') {
    const media = getMediaDetails(node.properties);
    icon = media.icon;
    kindLabel = media.format;
  } else {
    const kindDef = activeKinds.find((k: any) => k.id === node.kind);
    if (kindDef) {
      icon = kindDef.icon;
      kindLabel = kindDef.label;
    }
  }

  return { icon, kindLabel };
}