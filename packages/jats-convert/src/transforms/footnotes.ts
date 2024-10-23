import { copyNode } from 'myst-common';
import { remove } from 'unist-util-remove';
import type { Jats } from 'jats-xml';

/**
 * Move footnotes and sections from back to body
 *
 * Currently we only pass body to JATS convert plugin, so we move parts of
 * the backmatter that need parsing to body.
 */
export function backToBodyTransform(jats: Jats) {
  if (!jats.back) return;
  const backNodes = jats.back.children?.filter((node) => {
    return ['fn-group', 'sec', 'ack'].includes(node.type);
  });
  if (!jats.body?.children || backNodes.length === 0) return;
  jats.body.children.push({ type: 'thematicBreak' }, ...copyNode(backNodes));
  backNodes.forEach((node) => {
    node.type = '__delete__';
  });
  remove(jats.back, '__delete__');
}
