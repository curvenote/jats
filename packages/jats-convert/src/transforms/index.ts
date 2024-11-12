import type { GenericParent, GenericNode } from 'myst-common';
import type { Plugin } from 'unified';
import type { VFile } from 'vfile';

import { admonitionTransform } from './admonitions.js';
import { graphicToBioRxivUrl } from './biorxiv.js';
import { figCaptionTitleTransform } from './figureCaptions.js';
import { sectionTransform } from './sections.js';
import { typographyTransform } from './typography.js';

export * from './abbreviations.js';
export * from './abstract.js';
export * from './admonitions.js';
export * from './biorxiv.js';
export * from './citations.js';
export * from './figureCaptions.js';
export * from './footnotes.js';
export * from './references.js';
export * from './sections.js';
export * from './typography.js';

export function basicTransformations(tree: GenericParent, file: VFile) {
  sectionTransform(tree);
  typographyTransform(tree);
  admonitionTransform(tree, file);
  figCaptionTitleTransform(tree);
}

export const basicTransformationsPlugin: Plugin<[], GenericParent, GenericParent> =
  () => (tree, file) => {
    basicTransformations(tree, file);
  };

export function journalTransforms(tree?: GenericNode) {
  graphicToBioRxivUrl(tree);
}
