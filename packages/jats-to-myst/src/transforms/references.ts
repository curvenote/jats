import 'dotenv/config.js';
import fs from 'node:fs';
import path from 'node:path';
import OpenAI from 'openai';
import { convertPMIDs2DOIs, normalizePMID } from 'jats-fetch';
import type { Reference } from 'jats-tags';
import { Session, type ISession, type Jats } from 'jats-xml';
import type { GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import type { Cite } from 'myst-spec-ext';
import { select, selectAll } from 'unist-util-select';
import { computeHash } from 'myst-cli-utils';
import { remove } from 'unist-util-remove';

/**
 * Return DOI from pub-id element of Reference object
 *
 * If DOI is directly available in the reference it is returned.
 * If PubMed ID is available on the reference, DOI is looked up from
 * the pmid cache (this must already be populated).
 * Otherwise, this function returns undefined.
 */
export function doiFromRef(session: ISession, reference: Reference, pmids: Record<string, string>) {
  const doiElement = select('ext-link,[pub-id-type=doi]', reference);
  if (doiElement) doiCt += 1;
  if (doiElement) return toText(doiElement);
  const pmidElement = select('ext-link,[pub-id-type=pmid]', reference);
  if (pmidElement) {
    const pmid = normalizePMID(session, toText(pmidElement));
    const pmDoi = pmids[pmid];
    if (pmDoi) pmidCt += 1;
    if (pmDoi) return pmDoi;
  }
}

function cacheFolder(dir: string) {
  return path.join(dir, '_build', 'cache');
}

function pmidCacheFile(dir: string) {
  return path.join(cacheFolder(dir), 'jats-pmid-doi.json');
}

const OPENAI_INSTRUCTIONS = [
  'The user will send you one JSON reference.',
  'Translate the reference into BibTeX.',
  'The citation key must be the id of the ref element.',
  'Never surround the reference with code backticks.',
  'If you cannot translate it respond with an empty string "".',
  'If the reference contains no fields respond with an empty string "".',
  'If the reference is not available respond with an empty string "".',
].join('\n');

/**
 * Return single bibtex entry from Reference object
 *
 * If a cached entry exists for the Reference, it is returned.
 * If an OpenAI API key is available, OpenAI is queried
 * to generate a bibtex entry, and the result is cached.
 * Otherwise, this function returns undefined.
 */
async function getBibtexEntry(reference: Reference, dir: string) {
  const referenceString = JSON.stringify(reference);
  const cacheFile = path.join(cacheFolder(dir), `jats-bibtex-${computeHash(referenceString)}.bib`);
  if (fs.existsSync(cacheFile)) {
    aiCt += 1;
    return fs.readFileSync(cacheFile).toString();
  }
  if (!process.env.OPENAI_API_KEY) return undefined;
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: OPENAI_INSTRUCTIONS,
      },
      {
        role: 'user',
        content: referenceString,
      },
    ],
    temperature: 1,
    max_tokens: 256,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });
  const bibtex = response.choices[0]?.message?.content ?? '';
  fs.mkdirSync(cacheFolder(dir), { recursive: true });
  fs.writeFileSync(cacheFile, bibtex);
  aiCt += 1;
  return bibtex;
}

/**
 * Generate a DOI lookup dictionary for a list of PubMed IDs
 *
 * This will load lookup dictionary cached on path, if available,
 * then query (and cache) NIH APIs for other PMIDs
 *
 * Returns PMID -> DOI lookup dictionary
 */
async function getPMIDLookup(pmids: string[], dir: string) {
  let cache = loadPMIDCache(dir);
  const pmidsToFetch = pmids.filter((pmid) => !cache[pmid]);
  if (pmidsToFetch.length > 0) {
    const lookup = await convertPMIDs2DOIs(new Session(), pmidsToFetch);
    cache = { ...cache, ...lookup };
    savePMIDCache(cache, dir);
  }
  return cache;
}

function loadPMIDCache(dir: string): Record<string, string> {
  if (!fs.existsSync(pmidCacheFile(dir))) return {};
  return JSON.parse(fs.readFileSync(pmidCacheFile(dir)).toString());
}

function savePMIDCache(cache: Record<string, string>, dir: string) {
  fs.mkdirSync(cacheFolder(dir), { recursive: true });
  fs.writeFileSync(pmidCacheFile(dir), JSON.stringify(cache, null, 2));
  return JSON.parse(fs.readFileSync(pmidCacheFile(dir)).toString());
}

let doiCt = 0;
let pmidCt = 0;
let aiCt = 0;

/**
 * Resolve citations and references from JATS
 *
 * This function iterates over all the 'cite' nodes and resolves the corresponding reference.
 * It prioritizes DOIs, updating the cite nodes with those if available and discarding
 * any additional info contained in the Reference. If it cannot determine the DOI, it
 * uses OpenAI to generate a bibtex entry from the Reference.
 *
 * References not associated with a 'cite' node are ignored.
 */
export async function resolveJatsReferencesTransform(tree: GenericParent, jats: Jats, dir: string) {
  const bibfile = path.join(dir, 'main.bib');
  const writeBibtex = fs.existsSync(bibfile);
  const citeNodes = selectAll('cite', tree) as Cite[];
  const pmids = citeNodes
    .map((node) => {
      const reference = jats.references.find((ref) => ref.id === node.identifier);
      const pmidElement = select('ext-link,[pub-id-type=pmid]', reference);
      return pmidElement ? toText(pmidElement) : undefined;
    })
    .filter((pmid): pmid is string => !!pmid);
  const pmidLookup = await getPMIDLookup(pmids, dir);
  const bibtexEntries: string[] = [];
  await Promise.all(
    citeNodes.map(async (node) => {
      const reference = jats.references.find((ref) => ref.id === node.identifier);
      if (!reference) return undefined;
      remove(reference, 'label');
      if (!toText(reference)) return undefined;
      const doiString = doiFromRef(new Session(), reference, pmidLookup);
      if (doiString) {
        node.identifier = doiString;
        node.label = doiString;
      } else if (writeBibtex) {
        const bibtexEntry = await getBibtexEntry(reference, dir);
        if (bibtexEntry) bibtexEntries.push(bibtexEntry);
      }
    }),
  );
  if (writeBibtex && bibtexEntries.length) {
    fs.writeFileSync(bibfile, bibtexEntries.join('\n\n'));
  }
  console.log('total citations', citeNodes.length);
  console.log('doi citations', doiCt);
  console.log('pmid citations', pmidCt);
  console.log('ai citations', aiCt);
  console.log('unknown', citeNodes.length - doiCt - pmidCt - aiCt);
  doiCt = 0;
  pmidCt = 0;
  aiCt = 0;
  console.log('---');
}
