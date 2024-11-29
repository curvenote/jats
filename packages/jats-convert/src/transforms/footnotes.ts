import { copyNode } from 'myst-common';
import type { Back, Body } from 'jats-tags';

/**
 * Copy footnotes and sections from back into body tree
 *
 * Back is not modified.
 */
export function backToBodyTransform(body: Body, back?: Back) {
  if (!back) return;
  const backNodes = back.children?.filter((node) => {
    return ['fn-group', 'sec', 'ack'].includes(node.type);
  });
  if (!body?.children || backNodes.length === 0) return;
  body.children.push({ type: 'hr' }, ...copyNode(backNodes));
}
