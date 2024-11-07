import { S3Client } from '@aws-sdk/client-s3';
import { doi } from 'doi-utils';
import { tic, type ISession } from 'myst-cli-utils';
import type { DownloadResult, ResolutionOptions } from './types.js';
import { defaultFetcher, downloadFileFromS3, findFile } from './utils.js';

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
): Promise<Record<string, string | null> | undefined> {
  pmids = [...new Set(pmids.map((pmid) => normalizePMID(session, pmid)))];
  const pmDois: Record<string, string | null> = {};
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
    Object.entries(data?.result ?? {})
      .filter(([pmid]) => pmid !== 'uids')
      .forEach(([pmid, record]) => {
        const pmDoi = record.articleids?.find((articleid: { idtype?: string; value?: string }) => {
          return articleid.idtype === 'doi';
        })?.value;
        if (pmDoi) {
          pmDois[pmid] = pmDoi;
        } else {
          pmDois[pmid] = null;
        }
      });
  }
  session.log.debug(
    toc(
      `Used nih.gov to transform ${Object.values(pmDois).filter((pmDoi) => !!pmDoi).length}/${
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

type OpenAlexWork = {
  ids: {
    openalex?: string;
    doi?: string;
    mag?: string;
    pmid?: string;
    pmcid?: string;
  };
};

/**
 * Construct JATS download url from PubMed Central ID
 *
 * This url uses the efetch utility from NIH.
 *
 * If a DOI is provided, this will attempt to resolve the DOI to a PMCID
 */
export async function constructJatsUrlFromPubMedCentral(
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

export async function getPubMedJatsFromS3(
  session: ISession,
  pmcid: string,
): Promise<DownloadResult> {
  const client = new S3Client({
    region: 'us-east-1', // Specify the region of your bucket
  });
  let found: { path: string } | undefined;
  try {
    found = await findFile(client, pmcid);
  } catch {
    session.log.debug(`Error with AWS credentials`);
    return { success: false, source: pmcid };
  }
  if (!found) {
    session.log.debug(`Not available from open-access S3 bucket: ${pmcid}`);
    return { success: false, source: pmcid };
  } else {
    const result = await downloadFileFromS3(client, found.path);
    return result;
  }
}
