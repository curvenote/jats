import type { GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import { doi } from 'doi-utils';
import { select, selectAll } from 'unist-util-select';
import type { Affiliation, ArticleId, Xref } from 'jats-tags';
import { Tags } from 'jats-tags';
import type { Contributor } from 'myst-frontmatter';

export type PubIdTypes = 'doi' | 'pmc' | 'pmid' | 'publisher-id' | string;

export function findArticleId(
  node: GenericParent | undefined,
  pubIdType: PubIdTypes = 'doi',
): string | undefined {
  if (!node) return undefined;
  const id = select(`[pub-id-type=${pubIdType}]`, node);
  if (id && toText(id)) return toText(id);
  const doiTag = (selectAll(`${Tags.articleId},${Tags.pubId}`, node) as ArticleId[]).find((t) =>
    doi.validate(toText(t)),
  );
  return toText(doiTag) || undefined;
}

export function authorAndAffiliation(node: GenericParent, article: GenericParent): Contributor {
  const author: Contributor = {
    name: `${toText(select(Tags.givenNames, node))} ${toText(select(Tags.surname, node))}`,
  };
  const orcid = select('[contrib-id-type=orcid]', node);
  if (orcid) {
    author.orcid = toText(orcid).replace(/(https?:\/\/)?orcid\.org\//, '');
  }
  //
  /**
   * For example:
   *
   * ```xml
   * <aff id="aff2">
   * <label>2</label>
   * <institution-wrap>
   * <institution-id institution-id-type="ror">https://ror.org/00t9vx427</institution-id>
   * <institution>Department of Biochemistry, University of Texas Southwestern Medical Center</institution>
   * </institution-wrap>
   * <addr-line>
   * <named-content content-type="city">Dallas</named-content>
   * </addr-line>
   * <country>United States</country>
   * </aff>
   * ```
   */
  const affiliationRefs = selectAll('xref[ref-type=aff]', node) as Xref[];
  const affiliations = affiliationRefs.map((xref) =>
    select(`[id=${xref.rid}]`, article),
  ) as Affiliation[];
  const affiliationText = affiliations
    .map((aff) => {
      // TODO: handle rors!
      const ror = select(`[institution-id-type=ror]`, aff);
      return toText(select('institution', aff));
    })
    .filter((t) => !!t);
  if (affiliationText.length > 0) {
    author.affiliations = affiliationText;
  }
  return author;
}
