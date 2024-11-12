import type { GenericNode } from 'myst-common';
import { selectAll } from 'unist-util-select';

/**
 * Replace invalid 'citation' element with 'mixed-citation'
 *
 * This occurs in JATS from multiple publishers
 */
export function citationToMixedCitation(tree?: GenericNode) {
  selectAll('citation', tree).forEach((node) => {
    node.type = 'mixed-citation';
  });
}
