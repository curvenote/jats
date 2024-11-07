import type { Node } from 'unist-util-select';
import { copyNode as mystCopyNode, toText as mystToText } from 'myst-common';

/**
 * toText function that handles newer version of unist
 */
export function toText(node: Node | undefined) {
  return mystToText(node as any);
}
/**
 * copyNode function that handles newer version of unist
 */
export function copyNode(node: Node) {
  return mystCopyNode(node as any);
}
