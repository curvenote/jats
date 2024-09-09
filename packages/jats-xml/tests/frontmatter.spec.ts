import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { Jats } from '../src';

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  jats: string;
  // tree: Record<string, any>;
  frontmatter?: Record<string, any>;
  // citations?: Record<string, any>;
};

const directory = path.join('tests');

function loadCases(file: string) {
  const testYaml = fs.readFileSync(path.join(directory, file)).toString();
  return (yaml.load(testYaml) as TestFile).cases;
}

describe('JATS frontmatter', () => {
  const cases = loadCases('frontmatter.yml');
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))(
    '%s',
    async (_, { frontmatter, jats }) => {
      const loaded = new Jats(jats);
      expect(loaded.frontmatter).toEqual(frontmatter);
    },
  );
});
