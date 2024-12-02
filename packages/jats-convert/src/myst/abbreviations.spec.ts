import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { abbreviationsFromText } from './abbreviations';

type TestFile = {
  cases: TestCase[];
};
type TestCase = {
  title: string;
  text: string;
  abbreviations: Record<string, string>;
};

function loadCases(file: string) {
  const testYaml = fs.readFileSync(path.join(__dirname, file)).toString();
  return (yaml.load(testYaml) as TestFile).cases;
}

describe('Inline citation formatting', () => {
  const cases = loadCases('abbreviations.yml');
  test.each(cases.map((c): [string, TestCase] => [c.title, c]))(
    '%s',
    async (_, { text, abbreviations }) => {
      expect(abbreviationsFromText(text)).toEqual(abbreviations);
    },
  );
});
