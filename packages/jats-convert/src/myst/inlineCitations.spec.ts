import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { copyNode, type GenericParent } from 'myst-common';
import { inlineCitationsTransform } from './inlineCitations';

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  before: GenericParent;
  after?: GenericParent;
};

function loadCases(file: string) {
  const testYaml = fs.readFileSync(path.join(__dirname, file)).toString();
  return (yaml.load(testYaml) as TestFile).cases;
}

describe('Inline citation formatting', () => {
  const cases = loadCases('inlineCitations.yml');
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))(
    '%s',
    async (_, { before, after }) => {
      if (!after) after = copyNode(before);
      inlineCitationsTransform(before, [
        'example_2019',
        'example_2020',
        'example_2021',
        'example_2022',
        'example_2023',
        'example_2024',
      ]);
      expect(before).toEqual(after);
    },
  );
});
