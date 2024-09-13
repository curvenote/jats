import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { unified } from 'unified';
import type { LatexResult } from 'myst-to-tex';
import mystToTex from 'myst-to-tex';
import { jatsToMystTransform } from '../src';

function toTex(tree: any) {
  const pipe = unified().use(mystToTex);
  pipe.runSync(tree);
  const file = pipe.stringify(tree);
  const tex = (file.result as LatexResult).value;
  return tex;
}

describe('Basic JATS read', () => {
  test('read', async () => {
    const data = fs.readFileSync('tests/00003.xml').toString();
    const { tree } = await jatsToMystTransform(data);
    const tex = toTex(tree);
    expect(tex.includes('LDs have antimicrobial activity')).toBe(true);
  });
});
