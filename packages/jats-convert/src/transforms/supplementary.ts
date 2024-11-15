import type { Jats } from 'jats-xml';
import { selectAll } from 'unist-util-select';
import { copyNode } from '../utils.js';
import { remove } from 'unist-util-remove';

/**
 * Move any supplementary-material marked as position=float to end of document
 */
export function floatToEndTransform(jats: Jats) {
  if (!jats.body) return;
  const floatSupplementaryMaterial = selectAll('supplementary-material[position=float]', jats.body);
  if (floatSupplementaryMaterial.length === 0) return;
  jats.body.children?.push({ type: 'hr' });
  floatSupplementaryMaterial.forEach((node) => {
    const copy = copyNode(node);
    delete copy.position;
    jats.body?.children?.push(copy);
    node.type = '__delete__';
  });
  remove(jats.body, '__delete__');
}
