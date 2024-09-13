import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Jats } from 'jats-xml';
import { selectAll } from 'unist-util-select';
import { toText, type GenericNode } from 'myst-common';
import { jatsToMystTransform } from '../src';
import { convertToUnist } from '../../jats-utils/dist/utils';
import { xml2js } from 'xml-js';

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
    const loaded = await jatsToMystTransform(new Jats(jats));
    const citeNodes = selectAll('cite', loaded.tree) as GenericNode[];
    expect(citeNodes.length).toEqual(1);
    expect(citeNodes[0].label).toEqual(doi);
    expect(citeNodes[0].identifier).toEqual(doi);
  });
});
