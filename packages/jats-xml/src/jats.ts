import type { GenericNode, GenericParent } from 'myst-common';
import { toText } from 'myst-common';
import { xml2js } from 'xml-js';
import { doi } from 'doi-utils';
import type { Element, DeclarationAttributes } from 'xml-js';
import type { PageFrontmatter } from 'myst-frontmatter';
import { select as unistSelect, selectAll } from 'unist-util-select';
import { Tags } from 'jats-tags';
import { findArticleId, processAffiliation, processContributor } from './utils.js';
import type {
  Front,
  Body,
  Back,
  SubArticle,
  RefList,
  Reference,
  TitleGroup,
  ArticleTitle,
  Subtitle,
  Permissions,
  PubDate,
  License,
  Abstract,
  ContribGroup,
  Contrib,
  Affiliation,
  KeywordGroup,
  Keyword,
  ArticleCategories,
  ArticleMeta,
} from 'jats-tags';
import type { Logger } from 'myst-cli-utils';
import { tic } from 'myst-cli-utils';
import { articleMetaOrder, tableWrapOrder } from './order.js';
import {
  serializeJatsXml,
  type SerializationOptions,
  convertToUnist,
  convertToXml,
  toDate,
} from 'jats-utils';

type Options = { log?: Logger; source?: string };

function select<T extends GenericNode>(selector: string, node?: GenericNode): T | undefined {
  return (unistSelect(selector, node) ?? undefined) as T | undefined;
}

const DEFAULT_DOCTYPE =
  'article PUBLIC "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD with MathML3 v1.3 20210610//EN" "http://jats.nlm.nih.gov/publishing/1.3/JATS-archivearticle1-3-mathml3.dtd"';

type WriteOptions = SerializationOptions & {
  bodyOnly?: boolean;
};

export class Jats {
  declaration?: DeclarationAttributes;
  doctype?: string;
  raw: Element;
  log?: Logger;
  tree: GenericParent;
  source?: string;

  constructor(data: string, opts?: Options) {
    const toc = tic();
    this.log = opts?.log;
    if (opts?.source) this.source = opts.source;
    try {
      this.raw = xml2js(data, { compact: false }) as Element;
    } catch (error) {
      throw new Error('Problem parsing the JATS document, please ensure it is XML');
    }
    const { declaration, elements } = this.raw;
    this.declaration = declaration?.attributes;
    if (
      !(elements?.length === 2 && elements[0].type === 'doctype' && hasSingleArticle(elements[1]))
    ) {
      throw new Error('JATS must be structured as <!DOCTYPE><article>...</article>');
    }
    this.doctype = elements[0].doctype;
    const converted = convertToUnist(elements[1]);
    this.tree = select('article', converted) as GenericParent;
    this.log?.debug(toc('Parsed and converted JATS to unist tree in %s'));
  }

  get frontmatter(): PageFrontmatter {
    const title = this.articleTitle;
    const subtitle = this.articleSubtitle;
    const short_title = this.articleAltTitle;
    let date: string | undefined;
    if (this.publicationDate) {
      const pubDate = toDate(this.publicationDate);
      if (pubDate) {
        const year = pubDate.getFullYear();
        const month = (pubDate.getMonth() + 1).toString().padStart(2, '0');
        const day = pubDate.getDate().toString().padStart(2, '0');
        date = `${year}-${month}-${day}`;
      }
    }
    const authors = this.articleAuthors?.map((auth) => {
      return processContributor(auth);
    });
    const affiliations = this.articleAffiliations?.map((aff) => {
      return processAffiliation(aff);
    });
    const keywords = this.keywords?.map((k) => toText(k)) ?? [];
    const firstSubject = select(Tags.subject, this.articleCategories ?? this.front);
    const journalTitle = select(Tags.journalTitle, this.front);
    return {
      title: title ? toText(title) : undefined,
      subtitle: subtitle ? toText(subtitle) : undefined,
      short_title: short_title ? toText(short_title) : undefined,
      doi: this.doi ?? undefined,
      date,
      authors: authors.length ? authors : undefined,
      // editors,
      affiliations: affiliations.length ? affiliations : undefined,
      keywords: keywords.length ? keywords : undefined,
      venue: journalTitle ? { title: toText(journalTitle) } : undefined,
      subject: firstSubject ? toText(firstSubject) : undefined,
    };
  }

  get front(): Front | undefined {
    return select<Front>(Tags.front, this.tree);
  }

  get articleMeta(): ArticleMeta | undefined {
    return select<ArticleMeta>(Tags.articleMeta, this.tree);
  }

  get permissions(): Permissions | undefined {
    return select<Permissions>(Tags.permissions, this.front);
  }

  get doi(): string | undefined {
    return doi.normalize(findArticleId(this.front, 'doi') ?? '');
  }

  get pmc(): string | undefined {
    return findArticleId(this.front, 'pmc')?.replace(/^PMC:?/, '');
  }

  get pmid(): string | undefined {
    return findArticleId(this.front, 'pmid');
  }

  get publicationDates(): PubDate[] {
    return selectAll(Tags.pubDate, this.front) as PubDate[];
  }

  get publicationDate(): PubDate | undefined {
    return this.publicationDates.find((d) => !!select(Tags.day, d));
  }

  get license(): License | undefined {
    return select<License>(Tags.license, this.permissions);
  }

  get keywordGroup(): KeywordGroup | undefined {
    return select<KeywordGroup>(Tags.kwdGroup, this.front);
  }

  /** The first keywords */
  get keywords(): Keyword[] {
    return selectAll(Tags.kwd, this.keywordGroup) as Keyword[];
  }

  get keywordGroups(): KeywordGroup[] {
    return selectAll(Tags.kwdGroup, this.front) as KeywordGroup[];
  }

  get articleCategories(): ArticleCategories | undefined {
    return select<ArticleCategories>(Tags.articleCategories, this.front);
  }

  get titleGroup(): TitleGroup | undefined {
    return select<TitleGroup>(Tags.titleGroup, this.front);
  }

  get articleTitle(): ArticleTitle | undefined {
    return select<ArticleTitle>(Tags.articleTitle, this.titleGroup);
  }

  get articleSubtitle(): Subtitle | undefined {
    return select<Subtitle>(Tags.subtitle, this.titleGroup);
  }

  get articleAltTitle(): Subtitle | undefined {
    return select<Subtitle>(Tags.altTitle, this.titleGroup);
  }

  get abstract(): Abstract | undefined {
    return select<Abstract>(Tags.abstract, this.front);
  }

  get abstracts(): Abstract[] {
    return selectAll(Tags.abstract, this.front) as Abstract[];
  }

  get contribGroup(): ContribGroup | undefined {
    return select<ContribGroup>(Tags.contribGroup, this.front);
  }

  get contribGroups(): ContribGroup[] {
    return selectAll(Tags.contribGroup, this.front) as ContribGroup[];
  }

  get articleAuthors(): Contrib[] {
    const contribs = selectAll(Tags.contrib, {
      type: 'contribGroups',
      children: this.contribGroups,
    }) as Contrib[];
    const authors = contribs.filter((contrib) => {
      const contribType = contrib['contrib-type'];
      return !contribType || contribType === 'author';
    });
    return authors;
  }

  get articleAffiliations(): Affiliation[] {
    return selectAll(`${Tags.aff}[id]`, this.front) as Affiliation[];
  }

  get body(): Body | undefined {
    return select<Body>(Tags.body, this.tree);
  }

  get back(): Back | undefined {
    return select<Back>(Tags.back, this.tree);
  }

  get subArticles(): SubArticle[] {
    return selectAll(Tags.subArticle, this.tree) as SubArticle[];
  }

  get refList(): RefList | undefined {
    return select<RefList>(Tags.refList, this.back);
  }

  get references(): Reference[] {
    return selectAll(Tags.ref, this.refList) as Reference[];
  }

  sort() {
    if (this.articleMeta) {
      this.articleMeta.children = this.articleMeta?.children.sort(
        (a, b) =>
          articleMetaOrder.findIndex((x) => x === a.type) -
          articleMetaOrder.findIndex((x) => x === b.type),
      );
    }
    (selectAll('table-wrap', this.tree) as GenericParent[]).forEach((tw) => {
      tw.children = tw.children.sort(
        (a, b) => (tableWrapOrder[a.type] ?? -1) - (tableWrapOrder[b.type] ?? -1),
      );
    });
  }

  serialize(opts?: WriteOptions): string {
    this.sort();
    const body = convertToXml(this.tree);
    const element = opts?.bodyOnly
      ? body
      : {
          type: 'element',
          elements: [
            {
              type: 'doctype',
              doctype: this.doctype || DEFAULT_DOCTYPE,
            },
            body,
          ],
          declaration: { attributes: this.declaration ?? { version: '1.0', encoding: 'UTF-8' } },
        };

    const xml = serializeJatsXml(element, opts);
    return xml;
  }
}

function hasSingleArticle(element: Element): boolean {
  if (element.name === 'article') {
    return true;
  }
  if (
    element.name === 'pmc-articleset' &&
    element.elements?.length === 1 &&
    element.elements[0].name === 'article'
  ) {
    return true;
  }
  return false;
}
