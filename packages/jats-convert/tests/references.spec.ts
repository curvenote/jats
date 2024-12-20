import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Jats } from 'jats-xml';
import { selectAll } from 'unist-util-select';
import type { GenericNode } from 'myst-common';
import { jatsConvertTransform } from '../src';

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  jats: string;
  doi: string;
  // tree: Record<string, any>;
  // frontmatter?: Record<string, any>;
  // citations?: Record<string, any>;
};

const directory = path.join('tests');

function loadCases(file: string) {
  const testYaml = fs.readFileSync(path.join(directory, file)).toString();
  return (yaml.load(testYaml) as TestFile).cases;
}

describe('JATS references to DOI', () => {
  const cases = loadCases('references.yml');
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))('%s', async (_, { doi, jats }) => {
    const loaded = jatsConvertTransform(new Jats(jats), {
      dois: true,
      pmidCache: { '16755624': '10.1002/cbic.200500559' },
    });
    const citeNodes = selectAll('cite', loaded.tree) as GenericNode[];
    expect(citeNodes.length).toEqual(1);
    expect(citeNodes[0].label).toEqual(doi);
    expect(citeNodes[0].identifier).toEqual(doi);
  });
});
