import { doi } from 'doi-utils';
import fetch from 'node-fetch';
import type { ISession } from 'myst-cli-utils';
import { isUrl, tic } from 'myst-cli-utils';

import type { ResolutionOptions } from './types.js';
import { customResolveJatsUrlFromDoi } from './resolvers.js';

async function downloadFromUrl(
  session: ISession,
  jatsUrl: string,
  opts: ResolutionOptions,
): Promise<string> {
  const toc = tic();
  session.log.debug(`Fetching JATS from ${jatsUrl}`);
  const resp = await (opts?.fetcher ?? defaultFetcher)(jatsUrl, 'xml');
  if (!resp.ok) {
    session.log.debug(`JATS failed to download from "${jatsUrl}"`);
    throw new Error(`STATUS ${resp.status}: ${resp.statusText}`);
  }
  const contentType = resp.headers?.get('content-type');
  if (
    !(
      contentType?.includes('application/xml') ||
      contentType?.includes('text/xml') ||
      contentType?.includes('text/plain')
    )
  ) {
    session.log.warn(
      `Expected content-type "application/xml" instead we got "${contentType}" for ${jatsUrl}`,
    );
  }
  const data = await resp.text();
  session.log.debug(toc(`Fetched document with content-type "${contentType}" in %s`));
  return data;
}

type DoiLink = {
  URL: string;
  'content-type'?: 'application/xml' | 'application/pdf' | 'unspecified' | string;
  'content-version'?: 'vor' | string;
  'intended-application': 'text-mining' | 'similarity-checking' | string;
};

function defaultFetcher(url: string, kind?: 'json' | 'xml') {
  switch (kind) {
    case 'json':
      return fetch(url, { headers: [['Accept', 'application/json']] });
    case 'xml':
      return fetch(url, { headers: [['Accept', 'application/xml']] });
    default:
      return fetch(url);
  }
}

/**
 * There are 5.8M or so DOIs that have a full XML record:
 *
 * https://api.crossref.org/works?filter=full-text.type:application/xml,full-text.application:text-mining&facet=publisher-name:*&rows=0
 *
 * This function tries to find the correct URL for the record.
 */
async function checkIfDoiHasJats(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions,
): Promise<string | undefined> {
  if (!doi.validate(urlOrDoi)) return;
  const toc = tic();
  const doiUrl = doi.buildUrl(urlOrDoi) as string;
  session.log.debug(`Attempting to resolving full XML from DOI ${doiUrl}`);
  const resp = await (opts?.fetcher ?? defaultFetcher)(doiUrl, 'json');
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`DOI failed to resolve: ${doiUrl}`);
    return;
  }
  const data = (await resp.json()) as { link?: DoiLink[] };
  session.log.debug(toc(`DOI resolved in %s with ${data.link?.length ?? 0} links to content`));
  if (data.link) {
    session.log.debug(
      ['', ...data.link.map((link) => `content-type: ${link['content-type']}, ${link.URL}\n`)].join(
        '  - ',
      ),
    );
  }
  const fullXml = data.link?.find((link) =>
    ['text/xml', 'application/xml'].includes(link['content-type'] ?? ''),
  )?.URL;
  if (fullXml) return fullXml;
  session.log.debug(`Could not find XML in DOI record ${doiUrl}`);
  return undefined;
}

type OpenAlexWork = {
  ids: {
    openalex?: string;
    doi?: string;
    mag?: string;
    pmid?: string;
    pmcid?: string;
  };
};

export function normalizePMID(session: ISession, pmid: string) {
  if (pmid.startsWith('https://')) {
    const idPart = new URL(pmid).pathname.slice(1);
    session.log.debug(`Extract ${pmid} to ${idPart}`);
    return idPart;
  }
  return pmid;
}

const IDCONV_URL = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/';
const ESUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

/**
 * Convert a single PMID to PMCID
 *
 * Returns PMCID
 *
 * https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
 */
export async function convertPMID2PMCID(
  session: ISession,
  pmid: string,
  opts?: ResolutionOptions,
): Promise<string | undefined> {
  pmid = normalizePMID(session, pmid);
  const toc = tic();
  const resp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${pmid}`,
    'json',
  );
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to convert PubMedID: ${pmid}`);
    return;
  }
  const data = await resp.json();
  const pmcid = data?.records?.[0]?.pmcid;
  session.log.debug(toc(`Used nih.gov to transform ${pmid} to ${pmcid} in %s.`));
  return pmcid;
}

/**
 * Convert multiple PMIDs to PMCIDs
 *
 * Returns a PMID:PMCID lookup dictionary for successful conversions
 *
 * https://www.ncbi.nlm.nih.gov/pmc/tools/id-converter-api/
 */
export async function convertPMIDs2PMCIDs(
  session: ISession,
  pmids: string[],
  opts?: ResolutionOptions,
): Promise<Record<string, string> | undefined> {
  pmids = pmids.map((pmid) => normalizePMID(session, pmid));
  const toc = tic();
  const resp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${pmids.join(',')}`,
    'json',
  );
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to convert ${pmids.length} PubMedIDs`);
    return;
  }
  const data = await resp.json();
  const pmcidEntries = data?.records
    ?.filter((record: { pmid: string; pmcid?: string }) => record.pmcid)
    .map((record: { pmid: string; pmcid: string }) => [record.pmid, record.pmcid]);
  const pmcids = pmcidEntries ? Object.fromEntries(pmcidEntries) : {};
  session.log.debug(
    toc(`Used nih.gov to transform ${pmcidEntries.length}/${pmids.length} PMIDs to PMCID in %s.`),
  );
  return pmcids;
}

/**
 * Query NIH APIs for single DOI from PubMed ID
 */
export async function convertPMID2DOI(
  session: ISession,
  pmid: string,
  opts?: ResolutionOptions,
): Promise<string | undefined> {
  pmid = normalizePMID(session, pmid);
  const toc = tic();
  const idconvResp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${pmid}`,
    'json',
  );
  if (idconvResp.ok) {
    const data = await idconvResp.json();
    const pmDoi = data?.records?.[0]?.doi;
    if (pmDoi) {
      session.log.debug(
        toc(`Used nih.gov to query ${pmid} for DOI ${pmDoi} in %s. (Tool: idconv)`),
      );
      return pmDoi;
    }
  }
  const esummaryResp = await (opts?.fetcher ?? defaultFetcher)(
    `${ESUMMARY_URL}?db=pubmed&format=json&id=${pmid}`,
    'json',
  );
  if (esummaryResp.ok) {
    const data = await esummaryResp.json();
    const pmDoi = data?.result?.[pmid]?.articleids?.find(
      (articleid: { idtype?: string; value?: string }) => {
        return articleid.idtype === 'doi';
      },
    )?.value;
    if (pmDoi) {
      session.log.debug(
        toc(`Used nih.gov to query ${pmid} for DOI ${pmDoi} in %s. (Tool: esummary)`),
      );
      return pmDoi;
    }
  }
  // Silently return -- other functions can try!
  session.log.debug(`Failed to return DOI from PubMedID: ${pmid}`);
  return;
}

/**
 * Query NIH APIs for multiple DOIs from PubMed IDs
 */
export async function convertPMIDs2DOIs(
  session: ISession,
  pmids: string[],
  opts?: ResolutionOptions,
): Promise<Record<string, string> | undefined> {
  pmids = [...new Set(pmids.map((pmid) => normalizePMID(session, pmid)))];
  const pmDois: Record<string, string> = {};
  const toc = tic();
  const idconvResp = await (opts?.fetcher ?? defaultFetcher)(
    `${IDCONV_URL}?tool=jats-xml&format=json&ids=${pmids.join(',')}`,
    'json',
  );
  if (idconvResp.ok) {
    const data = await idconvResp.json();
    data?.records?.forEach((record: { pmid: string; doi?: string }) => {
      if (record.doi) pmDois[record.pmid] = record.doi;
    });
    const pmDoiCount = Object.keys(pmDois).length;
    if (pmDoiCount === pmids.length) {
      session.log.debug(toc(`Used nih.gov to convert ${pmDoiCount} PMIDs to DOIs in %s.`));
      return pmDois;
    }
  }
  const esummaryResp = await (opts?.fetcher ?? defaultFetcher)(
    `${ESUMMARY_URL}?db=pubmed&format=json&id=${pmids.filter((pmid) => !pmDois[pmid]).join(',')}`,
    'json',
  );
  if (esummaryResp.ok) {
    const data = (await esummaryResp.json()) as {
      result?: Record<string, { articleids?: { idtype?: string; value?: string }[] }>;
    };
    Object.entries(data?.result ?? {}).forEach(([pmid, record]) => {
      const pmDoi = record.articleids?.find((articleid: { idtype?: string; value?: string }) => {
        return articleid.idtype === 'doi';
      })?.value;
      if (pmDoi) pmDois[pmid] = pmDoi;
    });
  }
  session.log.debug(
    toc(
      `Used nih.gov to transform ${Object.keys(pmDois).length}/${
        pmids.length
      } PMIDs to PMCID in %s.`,
    ),
  );
  return pmDois;
}

function pubMedCentralJats(PMCID: string) {
  const normalized = PMCID.replace(/^PMC:?/, '');
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pmc&id=${normalized}`;
}

export async function checkIfPubMedCentralHasJats(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions,
): Promise<string | undefined> {
  if (urlOrDoi.match(/^PMC:?([0-9]+)$/)) return pubMedCentralJats(urlOrDoi);
  if (!doi.validate(urlOrDoi)) return;
  const toc = tic();
  const doiUrl = doi.buildUrl(urlOrDoi) as string;
  session.log.debug(`Attempting to resolve PMCID using OpenAlex from ${doiUrl}`);
  const openAlexUrl = `https://api.openalex.org/works/${doiUrl}`;
  const resp = await (opts?.fetcher ?? defaultFetcher)(openAlexUrl, 'json');
  if (!resp.ok) {
    // Silently return -- other functions can try!
    session.log.debug(`Failed to lookup on OpenAlex: ${openAlexUrl}`);
    return;
  }
  const data = (await resp.json()) as OpenAlexWork;
  const PMID = data?.ids?.pmid;
  let PMCID = data?.ids?.pmcid;
  if (!PMCID && !!PMID) {
    session.log.debug(
      toc(`OpenAlex resolved ${data?.ids.openalex} in %s. There is no PMCID, but there is a PMID`),
    );
    PMCID = await convertPMID2PMCID(session, PMID, opts);
    if (!PMCID) {
      session.log.debug(toc(`PubMed does not have a record of ${PMID}`));
      return;
    }
  }
  if (!PMCID) {
    session.log.debug(toc(`OpenAlex resolved ${data?.ids.openalex} in %s, but there is no PMCID`));
    return;
  }
  session.log.debug(toc(`OpenAlex resolved in %s, with a PMCID of ${PMCID}`));
  return pubMedCentralJats(PMCID);
}

export async function downloadJatsFromUrl(
  session: ISession,
  urlOrDoi: string,
  opts: ResolutionOptions = {},
): Promise<{ success: boolean; source: string; data?: string }> {
  const expectedUrls = (
    await Promise.all([
      checkIfPubMedCentralHasJats(session, urlOrDoi, opts),
      checkIfDoiHasJats(session, urlOrDoi, opts),
    ])
  ).filter((u): u is string => !!u);
  if (expectedUrls.length > 0) {
    session.log.debug(['Trying URLs:\n', ...expectedUrls.map((url) => ` ${url}\n`)].join('  - '));
    for (let index = 0; index < expectedUrls.length; index++) {
      const url = expectedUrls[index];
      try {
        const data = await downloadFromUrl(session, url, opts);
        if (data) return { success: true, source: url, data };
      } catch (error) {
        session.log.debug((error as Error).message);
      }
    }
    // If there are expected URLs that don't work: see something, say something, etc.
    return { success: false, source: expectedUrls[0] };
  }
  if (doi.validate(urlOrDoi)) {
    const jatsUrl = await customResolveJatsUrlFromDoi(session, urlOrDoi, opts);
    const data = await downloadFromUrl(session, jatsUrl, opts);
    return { success: true, source: jatsUrl, data };
  }
  if (isUrl(urlOrDoi)) {
    session.log.debug(
      "No resolver matched, and the URL doesn't look like a DOI. We will attempt to download it directly.",
    );
    const data = await downloadFromUrl(session, urlOrDoi, opts);
    return { success: true, source: urlOrDoi, data };
  }
  throw new Error(`Could not find ${urlOrDoi} locally, and it doesn't look like a URL or DOI`);
}
