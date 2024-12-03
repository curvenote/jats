import type { GenericNode, GenericParent } from 'myst-common';
import type { ProjectFrontmatter } from 'myst-frontmatter';
import { selectAll } from 'unist-util-select';
import { toText } from '../utils.js';
import { remove } from 'unist-util-remove';

/**
 * If there is a section titled abbreviations, try to move abbreviations to frontmatter
 *
 * There must be nothing else in the abbreviations section and the text must be
 * semicolon-delimited pairs of comma-separated value/definition.
 *
 * For example:
 *
 * # Abbreviations
 *
 * ACC1, acetyl-CoA carboxylase-1; BHT, butylated hydroxytoluene;
 * CER, ceramides; FASN, fatty acid synthase; FDR, false discovery rate.
 */
export function abbreviationSectionTransform(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
) {
  const blocks = selectAll('block', tree) as GenericParent[];
  blocks.forEach((block) => {
    if (block.children?.length !== 2) return;
    if (block.children[0].type !== 'heading') return;
    if (toText(block.children[0]).toLowerCase() !== 'abbreviations') return;
    if (block.children[1].type !== 'paragraph') return;
    const abbreviations = toText(block.children[1]).replace(/\.$/, '').split(/;\s*/g);
    const entries: ([string, string] | undefined)[] = abbreviations.map((abbr) => {
      const parts = abbr.split(/[,:]\s*/g);
      if (parts.length !== 2) return undefined;
      // Spaces in abbreviation value are not allowed
      if (parts[0].match(/\s/)) return undefined;
      return [parts[0], parts[1]];
    });
    // There cannot be a single invalid abbreviation
    if (entries.findIndex((entry) => !entry) !== -1) return;
    const newAbbreviations = Object.fromEntries(entries as [string, string][]);
    frontmatter.abbreviations = { ...frontmatter.abbreviations, ...newAbbreviations };
    block.type = '__delete__';
  });
  remove(tree, '__delete__');
}

/**
 * If there is a footnote that starts with "abbreviations:" try to move abbreviatons to frontmatter
 *
 */
export function abbreviationFootnoteTransform(
  tree: GenericParent,
  frontmatter: Pick<ProjectFrontmatter, 'abbreviations'>,
) {
  const fnDefs = selectAll('footnoteDefinition', tree) as GenericParent[];
  const fnRefs = (selectAll('footnoteReference', tree) as GenericNode[]).map(
    ({ identifier }) => identifier,
  );
  fnDefs.forEach((fnDef) => {
    if (fnDef.identifier && fnRefs.includes(fnDef.identifier)) return;
    if (fnDef.children?.length !== 1) return;
    if (fnDef.children[0].type !== 'paragraph') return;
    const fnText = toText(fnDef.children[0]);
    const abbrPrefix = 'abbreviations: ';
    if (!fnText.toLowerCase().startsWith(abbrPrefix)) return;
    const abbreviations = fnText.slice(abbrPrefix.length).replace(/\.$/, '').split(/;\s*/g);
    const entries: ([string, string] | undefined)[] = abbreviations.map((abbr) => {
      const parts = abbr.split(/[,:]\s*/g);
      if (parts.length !== 2) return undefined;
      // Spaces in abbreviation value are not allowed
      if (parts[0].match(/\s/)) return undefined;
      return [parts[0], parts[1]];
    });
    // There cannot be a single invalid abbreviation
    if (entries.findIndex((entry) => !entry) !== -1) return;
    const newAbbreviations = Object.fromEntries(entries as [string, string][]);
    frontmatter.abbreviations = { ...frontmatter.abbreviations, ...newAbbreviations };
    fnDef.type = '__delete__';
  });
  remove(tree, '__delete__');
}
