import { describe, expect, test } from 'vitest';
import fs from 'node:fs';
import { ManifestXml, createManifestXml } from '../src';

describe('manifest reading', () => {
  test('read and validate manifest from the spec', async () => {
    const data = fs.readFileSync('tests/manifest-spec.xml').toString();
    const manifest = new ManifestXml(data);
    expect(manifest.version).toBe('1');
    expect(manifest.articleMetadata).toEqual({
      id: 'random-identifier1',
      itemType: 'article-metadata',
      description: 'This is the article.xml file that contains the submission’s metadata',
      href: 'DEMO151_D-18-01229.xml',
      mediaType: 'application/xml',
      metadata: {},
    });
    expect(manifest.itemTypes).toEqual([
      'article-metadata',
      'review-metadata',
      'transfer-metadata',
      'manuscript',
      'author agreement',
      'Reviewer Response',
      'figure',
      'supplemental',
      'Author/Editor PDF',
      'Manuscript',
      'Reviewer Attachment',
      'Author Proof',
    ]);
    expect(manifest.items.length).toBe(13);
    expect(manifest.items.filter(({ itemType }) => itemType === 'figure')[0]).toEqual({
      id: 'b-456',
      itemType: 'figure',
      version: '0',
      description: 'Figure',
      href: 'wrist_scaphoidvx_diagnosis.jpg',
      mediaType: 'image/jpeg',
      fileOrder: '3',
      metadata: {
        'Figure Number': '1',
        Caption: 'This is the caption for Figure 1',
      },
    });
  });
  test.only('round trip manifest', async () => {
    const data = fs.readFileSync('tests/manifest-spec.xml').toString();
    const manifest = new ManifestXml(data);
    const trip = createManifestXml(manifest.items);
    const manifest2 = new ManifestXml(trip);
    expect(manifest2.items).toEqual(manifest.items);
  });
});
