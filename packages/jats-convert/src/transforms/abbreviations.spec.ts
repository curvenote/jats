import { describe, expect, test } from 'vitest';
import { abbreviationSectionTransform } from './abbreviations';
import type { PageFrontmatter } from 'myst-frontmatter';
import { copyNode } from '../utils';

describe('abbreviationSectionTransform', () => {
  test('valid abbreviations are pulled out', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'block',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: 'Some text',
                },
              ],
            },
          ],
        },
        {
          type: 'block',
          children: [
            {
              type: 'heading',
              children: [
                {
                  type: 'text',
                  value: 'Abbreviations',
                },
              ],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value:
                    'ACC1, acetyl-CoA carboxylase-1; BHT: butylated hydroxytoluene;CER,ceramides; FASN, fatty acid synthase; FDR, false discovery rate.',
                },
              ],
            },
          ],
        },
      ],
    };
    const result = {
      type: 'root',
      children: [
        {
          type: 'block',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: 'Some text',
                },
              ],
            },
          ],
        },
      ],
    };
    const frontmatter: PageFrontmatter = {
      title: 'my title',
      abbreviations: {
        ABC: 'alphabet',
      },
    };
    abbreviationSectionTransform(tree, frontmatter);
    expect(tree).toEqual(result);
    expect(frontmatter).toEqual({
      title: 'my title',
      abbreviations: {
        ABC: 'alphabet',
        ACC1: 'acetyl-CoA carboxylase-1',
        BHT: 'butylated hydroxytoluene',
        CER: 'ceramides',
        FASN: 'fatty acid synthase',
        FDR: 'false discovery rate',
      },
    });
  });
  test('single invalid abbreviation prevents removal', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'block',
          children: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value: 'Some text',
                },
              ],
            },
          ],
        },
        {
          type: 'block',
          children: [
            {
              type: 'heading',
              children: [
                {
                  type: 'text',
                  value: 'Abbreviations',
                },
              ],
            },
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  value:
                    'ACC1, acetyl-CoA carboxylase-1; BHT: butylated hydroxytoluene;CER,ceramides; FASN, fatty acid synthase; FD R, false discovery rate.',
                },
              ],
            },
          ],
        },
      ],
    };
    const result = copyNode(tree);
    const frontmatter: PageFrontmatter = {
      title: 'my title',
      abbreviations: {
        ABC: 'alphabet',
      },
    };
    abbreviationSectionTransform(tree, frontmatter);
    expect(tree).toEqual(result);
    expect(frontmatter).toEqual({
      title: 'my title',
      abbreviations: {
        ABC: 'alphabet',
      },
    });
  });
});
