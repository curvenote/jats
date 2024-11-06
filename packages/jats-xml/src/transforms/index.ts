import type { GenericNode } from 'myst-common';
import { graphicToBioRxivUrl } from './biorxiv.js';

export * from './citations.js';

export function journalTransforms(tree?: GenericNode) {
  graphicToBioRxivUrl(tree);
}
