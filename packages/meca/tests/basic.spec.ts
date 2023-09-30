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
  test('validate example', async () => {
    const valid = await validateMeca(new Session(), 'tests/example.zip', {});
    expect(valid).toBe(true);
  });
  test('validate example', async () => {
    const valid = await validateMeca(new Session(), 'tests/example.meca', {});
    expect(valid).toBe(true);
  });
  test('validate example with transfer', async () => {
    const valid = await validateMeca(new Session(), 'tests/example-with-transfer.zip', {});
    expect(valid).toBe(true);
  });
  test('validate example with bad transfer', async () => {
    const valid = await validateMeca(new Session(), 'tests/bad-transfer-xml.zip', {});
    expect(valid).toBe(false);
  });
});
