import type { GenericNode } from 'myst-common';
import { citationToMixedCitation, graphicToBioRxivUrl } from './biorxiv.js';

export function journalTransforms(tree?: GenericNode) {
  citationToMixedCitation(tree);
  graphicToBioRxivUrl(tree);
}
