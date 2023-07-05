import { describe, expect, test } from 'vitest';
import { Session } from 'jats-xml';
import { validateMeca, validateMecaWrapper } from '../src';

describe('meca validation', () => {
  test('empty file is invalid', async () => {
    expect(await validateMeca(new Session(), '', {})).toBeFalsy();
  });
  test('empty file errors in wrapper', async () => {
    await expect(validateMecaWrapper(new Session(), '', {})).rejects.toThrow();
  });
});
