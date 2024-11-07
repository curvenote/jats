import fetch from 'node-fetch';
import type { S3Client } from '@aws-sdk/client-s3';
import { HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { DownloadResult } from './types.js';

export function defaultFetcher(url: string, kind?: 'json' | 'xml') {
  switch (kind) {
    case 'json':
      return fetch(url, { headers: [['Accept', 'application/json']] });
    case 'xml':
      return fetch(url, { headers: [['Accept', 'application/xml']] });
    default:
      return fetch(url);
  }
}

const S3_CONFIG: { bucketName: string; paths: string[]; typeMap: Record<string, string> } = {
  bucketName: 'pmc-oa-opendata',
  paths: ['oa_comm/xml/all/', 'oa_noncomm/xml/all/', 'author_manuscript/xml/all/'],
  typeMap: {
    'oa_comm/xml/all/': 'Open Access (oa_comm)',
    'oa_noncomm/xml/all/': 'Open Access NonCommercial (oa_noncomm)',
    'author_manuscript/xml/all/': 'AAM (author_manuscript)',
  },
};

export async function checkFileExists(client: S3Client, id: string, path: string) {
  const key = `${path}${id}.xml`;
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_CONFIG.bucketName,
      Key: key,
    });
    await client.send(command);
    // If the command succeeds, the file exists
    return key;
  } catch (err: any) {
    if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
      // The file does not exist in this path
      return null;
    } else {
      // Some other error occurred
      throw err;
    }
  }
}

/**
 * Find if file exists on one of the S3 paths
 */
export async function findFile(client: S3Client, id: string) {
  for (const path of S3_CONFIG.paths) {
    const result = await checkFileExists(client, id, path);
    if (result) {
      return {
        path: result,
        type: S3_CONFIG.typeMap[path],
      };
    }
  }
}

export async function downloadFileFromS3(
  client: S3Client,
  s3FilePath: string,
): Promise<DownloadResult> {
  const command = new GetObjectCommand({
    Bucket: S3_CONFIG.bucketName,
    Key: s3FilePath,
  });
  try {
    const response = await client.send(command);
    const data = await response.Body?.transformToString();
    return { success: !!data, source: s3FilePath, data };
  } catch (err) {
    return { success: false, source: s3FilePath };
  }
}
