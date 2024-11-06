import type { Node } from 'unist-util-select';
import { toText as mystToText } from 'myst-common';

/**
 * toText function that handles newer version of unist
 */
export function toText(node: Node | undefined) {
  return mystToText(node as any);
}
