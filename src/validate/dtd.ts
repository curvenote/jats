import fs, { createReadStream } from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import unzipper from 'unzipper';
import { sync as which } from 'which';
import type { ISession } from '../types';
import { makeExecutable, writeFileToFolder } from 'myst-cli-utils';
import chalk from 'chalk';

const JATS_VERSIONS = [
  '1.1',
  '1.1d1',
  '1.1d2',
  '1.1d3',
  '1.2',
  '1.2d1',
  '1.2d2',
  '1.3',
  '1.3d1',
  '1.3d2',
];
const DEFAULT_JATS_VERSION = '1.3';
const MATHML_VERSIONS = ['2', '3'];
const DEFAULT_MATHML_VERSION = '3';

type Options = {
  jats: string;
  mathml: '2' | '3';
  oasis: boolean;
  // library: 'Archiving';
  directory: string;
};

function validateOptions(opts: any) {
  let jats: string;
  if (!opts.jats) {
    jats = DEFAULT_JATS_VERSION;
  } else if (!JATS_VERSIONS.includes(opts.jats)) {
    throw new Error(
      `Invalid JATS version "${opts.jats}" - must be one of [${JATS_VERSIONS.join(', ')}]`,
    );
  } else {
    jats = opts.jats;
  }
  let mathml: '2' | '3';
  if (!opts.mathml) {
    mathml = DEFAULT_MATHML_VERSION;
  } else if (!MATHML_VERSIONS.includes(opts.mathml)) {
    throw new Error(
      `Invalid MathML version "${opts.mathml}" - must be one of [${MATHML_VERSIONS.join(', ')}]`,
    );
  } else {
    mathml = opts.mathml;
  }
  const out: Options = {
    jats,
    mathml,
    oasis: !!opts.oasis,
    directory: opts.directory ?? defaultDirectory(),
  };
  return out;
}

function dtdFolder(opts: Options) {
  const version = opts.jats.replace('.', '-');
  const oasis = opts.oasis ? '-OASIS' : '';
  const mathml = `MathML${opts.mathml}`;
  return `JATS-Archiving-${version}${oasis}-${mathml}-DTD`;
}

function dtdZipFile(opts: Options) {
  return `${dtdFolder(opts)}.zip`;
}

function localDtdZipFile(opts: Options) {
  return path.join(opts.directory, dtdZipFile(opts));
}

function dtdFile(opts: Options) {
  const version = opts.jats.startsWith('1.3') ? opts.jats.replace('.', '-') : '1';
  const article = opts.oasis ? 'archive-oasis-article' : 'archivearticle';
  const mathml = opts.mathml === '3' ? '-mathml3' : '';
  return `JATS-${article}${version}${mathml}.dtd`;
}

function localDtdFile(opts: Options) {
  return path.join(opts.directory, dtdFolder(opts), dtdFile(opts));
}

function ftpUrl(opts: Options) {
  return `https://ftp.ncbi.nih.gov/pub/jats/archiving/${opts.jats}/${dtdZipFile(opts)}`;
}

function defaultDirectory() {
  return path.join(__dirname, 'static');
}

async function dtdDownload(session: ISession, opts: Options) {
  if (!fs.existsSync(opts.directory)) {
    fs.mkdirSync(opts.directory, { recursive: true });
  }
  session.log.info(`🌎 Downloading: ${ftpUrl(opts)}`);
  session.log.debug(`Saving to ${localDtdZipFile(opts)}`);
  const resp = await fetch(ftpUrl(opts));
  writeFileToFolder(localDtdZipFile(opts), await resp.buffer());
}

async function ensureDtdZipExists(session: ISession, opts: Options) {
  if (!fs.existsSync(path.join(opts.directory, dtdZipFile(opts)))) {
    await dtdDownload(session, opts);
  }
}

async function ensureDtdExists(session: ISession, opts: Options) {
  if (!fs.existsSync(localDtdFile(opts))) {
    await ensureDtdZipExists(session, opts);
    const zipFile = localDtdZipFile(opts);
    session.log.info(`🤐 Unzipping template on disk ${zipFile}`);
    await createReadStream(zipFile)
      .pipe(unzipper.Extract({ path: opts.directory }))
      .promise();
  }
  session.log.debug(`Validating against ${localDtdFile(opts)}`);
}

function isXmllintAvailable() {
  return which('xmllint', { nothrow: true });
}

export async function validateJatsAgainstDtd(
  session: ISession,
  file: string,
  opts?: Partial<Options>,
) {
  if (!isXmllintAvailable()) {
    session.log.error(
      `JATS validation against DTD requires xmllint\n\n${chalk.dim(
        'To install:\n  mac:    brew install xmlstarlet\n  debian: apt install libxml2-utils',
      )}`,
    );
    return;
  }
  const validatedOpts = validateOptions(opts ?? {});
  await ensureDtdExists(session, validatedOpts);
  try {
    // First drop DOCTYPE with DTD in it - we have already fetched the DTD
    const dropDtdCommand = `xmllint --dropdtd`;
    const validateCommand = `xmllint --noout --dtdvalid ${localDtdFile(validatedOpts)}`;
    await makeExecutable(`${dropDtdCommand} ${file} | ${validateCommand} -`, session.log)();
  } catch {
    return false;
  }
  return true;
}

export async function validateJatsAgainstDtdWrapper(
  session: ISession,
  file: string,
  opts?: Partial<Options>,
) {
  const success = await validateJatsAgainstDtd(session, file, opts);
  if (success) {
    session.log.info(chalk.greenBright('JATS validation passed!'));
  } else {
    throw new Error('JATS validation failed.');
  }
}
