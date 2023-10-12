import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import chalk from 'chalk';
import type { ISession, JatsOptions } from 'jats-xml';
import { validateJatsAgainstDtd } from 'jats-xml';
import { ItemTypes, MANIFEST, ManifestXml } from './manifest.js';
import { createTempFolder, removeTempFolder } from './utils.js';
import { TRANSFER, TransferXml } from './transfer.js';

const KNOWN_ITEM_TYPES: string[] = Object.values(ItemTypes);

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
  if (!(file.endsWith('.meca') || file.endsWith('-meca.zip'))) {
    session.log.warn(`Some providers may require a file ending with '.meca' or '-meca.zip'`);
  }
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
  const manifestString = manifestEntry.getData().toString();
  const manifest = new ManifestXml(manifestString, { log: session.log });
  const tempFolder = createTempFolder();
  const manifestIsValid = await manifest.validateXml();
  if (!manifestIsValid) {
    return errorAndClean(session, `${MANIFEST} DTD validation failed`, tempFolder);
  }
  const transferFiles = await Promise.all(
    manifest.transferMetadata?.map(async (item) => {
      const entry = mecaZip.getEntry(item.href);
      if (!entry) return false;
      const data = entry.getData().toString();
      try {
        const transfer = new TransferXml(data, { log: session.log });
        const valid = await transfer.validateXml();
        if (!valid) session.log.error(`${TRANSFER} DTD validation failed`);
        return valid;
      } catch (error) {
        session.log.error(`Could not read ${item.href} or DTD validation failed`);
        return false;
      }
    }),
  );
  if (!transferFiles.reduce((a, b) => a && b, true)) {
    return errorAndClean(session, `${TRANSFER} validation failed`, tempFolder);
  }
  debugCheck(session, `${MANIFEST} passes schema validation`);
  const manifestItems = manifest.items;
  const zipEntries = mecaZip.getEntries();
  // Get all file and folder names in the zip file.
  // Folders may not be explicitly listed in zipEntries, so we compute all folders from file paths.
  const zipEntryNames: Set<string> = new Set();
  zipEntries.forEach((entry) => {
    const nameParts = entry.entryName.split('/');
    for (let i = 1; i <= nameParts.length; i++) {
      zipEntryNames.add(nameParts.slice(0, i).join('/'));
    }
  });
  const manifestExtras = manifestItems
    .map((item) => item.href)
    .filter((href) => !zipEntryNames.has(href.replace(/\/$/, ''))); // Ignore trailing slash
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
  debugCheck(session, 'manifest matches MECA bundle contents');
  manifestItems.forEach((item) => {
    if (!item.mediaType) {
      session.log.warn(`manifest item missing media-type: ${item.href}`);
    }
    if (!item.itemType) {
      session.log.warn(`manifest item missing item-type: ${item.href}`);
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
