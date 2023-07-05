import fs from 'fs';
import path from 'path';
import os from 'os';
import AdmZip from 'adm-zip';
import chalk from 'chalk';
import type { Element } from 'xml-js';
import { xml2js } from 'xml-js';
import type { ISession, JatsOptions } from 'jats-xml';
import { validateJatsAgainstDtd, xmllintValidate } from 'jats-xml';

const KNOWN_ITEM_TYPES: string[] = [
  'article-metadata',
  'article-supporting-file',
  'manuscript',
  'manuscript-supporting-file',
  'article-source',
  'article-source-environment',
  'article-source-directory',
];

const MANIFEST = 'manifest.xml';

const MANIFEST_DTD = 'MECA_manifest.dtd';

type ManifestItem = {
  href: string;
  itemType?: string;
  mediaType?: string;
};

/**
 * Function to log debug message for passing check
 */
function debugCheck(session: ISession, msg: string) {
  session.log.debug(chalk.green(`✓ ${msg}`));
}

/**
 * Function to log an error and clean temp folder
 */
function errorAndClean(session: ISession, msg: string, tempFolder?: string) {
  session.log.error(msg);
  removeTempFolder(tempFolder);
  return false;
}

function removeTempFolder(tempFolder?: string) {
  if (tempFolder && fs.existsSync(tempFolder)) {
    if (fs.rmSync) {
      // Node >= 14.14
      fs.rmSync(tempFolder, { recursive: true });
    } else {
      // Node < 14.14
      fs.rmdirSync(tempFolder, { recursive: true });
    }
  }
}

function createTempFolder() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'meca'));
}

/**
 * Extract list of simple manifest item from valid manifest XML
 */
function extractManifestItems(manifestString: string) {
  const manifest = xml2js(manifestString);
  const items: ManifestItem[] =
    manifest.elements
      ?.find((element: Element) => element.name === 'manifest')
      ?.elements?.filter((element: Element) => element.name === 'item')
      ?.map((item: Element) => {
        const instanceAttrs = item.elements?.find(
          (element: Element) => element.name === 'instance',
        )?.attributes;
        const href = instanceAttrs?.['xlink:href'];
        if (!href) return undefined;
        return {
          href,
          itemType: item.attributes?.['item-type'],
          mediaType: instanceAttrs['media-type'],
        };
      })
      .filter((item: ManifestItem | undefined) => !!item) ?? [];
  return items;
}

/**
 * Validate a given file as MECA bundle
 *
 * Returns true if file is valid.
 *
 * Validation checks:
 * - File exists and is zip format
 * - Bundle includes manifest.xlm which validates against DTD
 * - manifest matches items present in the bundle
 * - manifest item types match known types
 * - JATS items validate
 */
export async function validateMeca(session: ISession, file: string, opts: Partial<JatsOptions>) {
  if (!fs.existsSync(file)) return errorAndClean(session, `Input file does not exists: ${file}`);
  let mecaZip: AdmZip;
  try {
    mecaZip = new AdmZip(file);
  } catch {
    return errorAndClean(session, `Input file is not a zip archive: ${file}`);
  }
  debugCheck(session, 'is zip archive');
  const manifestEntry = mecaZip.getEntry(MANIFEST);
  if (!manifestEntry) {
    return errorAndClean(
      session,
      `Input zip archive does not include required manifest file '${MANIFEST}'`,
    );
  }
  debugCheck(session, `includes ${MANIFEST}`);
  const localDtdFile = fs.existsSync(path.join(__dirname, MANIFEST_DTD))
    ? path.join(__dirname, MANIFEST_DTD)
    : path.join(__dirname, '..', MANIFEST_DTD);
  if (!fs.existsSync(localDtdFile)) {
    throw new Error(`Unable to locate manifest DTD file ${MANIFEST_DTD} in meca lib distribution`);
  }
  const tempFolder = createTempFolder();
  mecaZip.extractEntryTo(MANIFEST, tempFolder);
  const manifestIsValid = await xmllintValidate(
    session,
    path.join(tempFolder, MANIFEST),
    localDtdFile,
  );
  if (!manifestIsValid) {
    return errorAndClean(session, `${MANIFEST} DTD validation failed`, tempFolder);
  }
  debugCheck(session, `${MANIFEST} passes schema validation`);
  const manifestString = manifestEntry.getData().toString();
  const manifestItems = extractManifestItems(manifestString);
  const zipEntries = mecaZip.getEntries();
  const manifestExtras = manifestItems
    .filter((item) => !zipEntries.map((entry) => entry.entryName).includes(item.href))
    .map((item) => item.href);
  const zipExtras = zipEntries
    .filter((entry) => entry.entryName !== MANIFEST)
    .filter((entry) => !entry.isDirectory)
    .filter((entry) => !manifestItems.map((item) => item.href).includes(entry.entryName))
    .map((entry) => entry.entryName);
  if (zipExtras.length) {
    session.log.warn(
      `MECA bundle includes items missing from manifest:\n- ${zipExtras.join('\n- ')}`,
    );
  }
  if (manifestExtras.length) {
    return errorAndClean(
      session,
      `manifest items missing from MECA bundle:\n- ${manifestExtras.join('\n- ')}`,
      tempFolder,
    );
  }
  debugCheck(session, 'manfiest matches MECA bundle contents');
  manifestItems.forEach((item) => {
    if (!item.mediaType) {
      session.log.warn(`manifest item missing media-type: ${item.href}`);
    }
    if (!item.itemType) {
      session.log.warn(`manifest item missing item-type: ${item.href} `);
    } else if (!KNOWN_ITEM_TYPES.includes(item.itemType)) {
      session.log.warn(`manifest item has unknown item-type "${item.itemType}": ${item.href} `);
    }
  });
  const jatsFiles = manifestItems
    .filter((item) => item.itemType === 'article-metadata')
    .map((item) => item.href);
  const invalidJatsFiles = (
    await Promise.all(
      jatsFiles.map(async (jatsFile) => {
        mecaZip.extractEntryTo(jatsFile, tempFolder);
        const isValid = await validateJatsAgainstDtd(
          session,
          path.join(tempFolder, ...jatsFile.split('/')),
          opts,
        );
        return isValid ? undefined : jatsFile;
      }),
    )
  ).filter((jatsFile) => !!jatsFile);
  if (invalidJatsFiles.length) {
    return errorAndClean(
      session,
      `JATS DTD validation failed:\n- ${invalidJatsFiles.join('\n- ')}`,
      tempFolder,
    );
  }
  debugCheck(session, 'JATS validation passed');
  removeTempFolder(tempFolder);
  return true;
}

/**
 * Validate a given file as MECA bundle
 *
 * Logs confirmation message if valid and throws an error if invalid.
 */
export async function validateMecaWrapper(
  session: ISession,
  file: string,
  opts: Partial<JatsOptions>,
) {
  const success = await validateMeca(session, file, opts);
  if (success) {
    session.log.info(chalk.greenBright('MECA validation passed!'));
  } else {
    throw new Error('MECA validation failed.');
  }
}
