import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { TransferXml, createTransferXml } from '../src';

describe('transfer.xml', () => {
  test('validate against the dtd', async () => {
    const data = fs.readFileSync('tests/transfer-spec.xml').toString();
    const transfer = new TransferXml(data);
    const isValid = await transfer.validateXml();
    expect(isValid).toBe(true);
  });
  test('alt version fails against the standard dtd', async () => {
    const data = fs.readFileSync('tests/transfer-alt.xml').toString();
    const transfer = new TransferXml(data);
    const isValid = await transfer.validateXml();
    expect(isValid).toBe(false);
    const isValidAlt = await transfer.validateXml('https://meca.zip/transfer-ejp.dtd');
    expect(isValidAlt).toBe(true);
  });
  test('read and validate transfer from the spec', async () => {
    const data = fs.readFileSync('tests/transfer-spec.xml').toString();
    const transfer = new TransferXml(data);
    expect(transfer.version).toBe('1.0');
    expect(transfer.source).toEqual({
      provider: {
        name: 'Aries Systems',
        contact: {
          name: { given: 'Mary', surname: 'Smith' },
          email: 'MarySmith@sample.email',
          phone: '444-555-0101',
        },
      },
      publication: {
        type: 'journal',
        title: 'The Journal of the American Medical Association',
        acronym: 'JAMA',
        contact: {
          email: 'MyJournal@ariessys.com',
        },
      },
    });
    expect(transfer.destination).toEqual({
      provider: {
        name: 'Highwire',
        contact: {
          role: 'Project Manager',
          name: { given: 'John', surname: 'Rogers' },
          email: 'jrogers@highwire.com',
          phone: '444-555-1212',
        },
      },
      publication: {
        type: 'preprint-server',
        title: 'bioRxiv',
        acronym: 'bioRxiv',
        contact: {
          role: 'Managing Editor',
          name: { given: 'Sally', surname: 'Rogers' },
          email: 'srogers@bioarxiv.com',
          phone: '301-555-1212',
        },
      },
      security: { auth: 'abdasa-13123-abae' },
    });
    expect(transfer.instructions).toEqual({
      instructions: [
        { sequence: '1', instruction: 'Verify XML First' },
        { sequence: '2', instruction: 'Load XML' },
      ],
      comments: ['Free form comments'],
    });
  });
  test('read and validate transfer example', async () => {
    const data = fs.readFileSync('tests/transfer-alt.xml').toString();
    const transfer = new TransferXml(data);
    expect(transfer.version).toBe('1.0');
    expect(transfer.source).toEqual({
      provider: {
        name: 'Curvenote Publishing',
        contact: {
          role: 'Technical Support',
          name: {
            given: 'Curvenote',
            surname: 'Support',
          },
          email: 'support@curvenote.com',
        },
      },
      publication: {
        type: 'journal',
        title: 'Notebooks Now!',
        acronym: 'nn',
        contact: {
          role: 'Editor',
          name: {
            given: 'Curvenote',
            surname: 'Support',
          },
          email: 'support@curvenote.com',
        },
      },
    });
    expect(transfer.destination).toEqual({
      provider: {
        contact: {},
      },
      publication: {
        type: 'journal',
        title: 'Notebooks Now!',
        acronym: 'nn',
        contact: {
          role: 'Editor',
          email: 'support@curvenote.com',
        },
      },
    });
    expect(transfer.instructions).toEqual({
      instructions: [],
      comments: ['Please publish this JATS notebook'],
    });
  });
  test('round trip manifest', async () => {
    const data = fs.readFileSync('tests/transfer-spec.xml').toString();
    const transfer = new TransferXml(data);
    const trip = createTransferXml(transfer);
    const transfer2 = new TransferXml(trip);
    expect(transfer2.source).toEqual(transfer.source);
    expect(transfer2.destination).toEqual(transfer.destination);
    expect(transfer2.instructions).toEqual(transfer.instructions);
    const valid = await transfer2.validateXml();
    expect(valid).toEqual(true);
  });
  test('round trip manifest (simplified)', async () => {
    const data = fs.readFileSync('tests/transfer-spec.xml').toString();
    const transfer = new TransferXml(data);
    const trip = createTransferXml(transfer, { simplifiedXML: true });
    const transfer2 = new TransferXml(trip);
    expect(transfer2.source).toEqual(transfer.source);
    expect(transfer2.destination).toEqual(transfer.destination);
    expect(transfer2.instructions).toEqual(transfer.instructions);
    const valid = await transfer2.validateXml('https://meca.zip/transfer-ejp.dtd');
    expect(valid).toEqual(true);
  });
});
