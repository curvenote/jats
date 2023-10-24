export const articleMetaOrder = [
  'article-id',
  'article-version',
  'article-version-alternatives',
  'article-categories',
  'title-group',
  'contrib-group',
  'aff',
  'aff-alternatives',
  'x',
  'author-notes',
  'pub-date',
  'pub-date-not-available',
  'volume',
  'volume-id',
  'volume-series',
  'issue',
  'issue-id',
  'issue-title',
  'issue-title-group',
  'issue-sponsor',
  'issue-part',
  'volume-issue-group',
  'isbn',
  'supplement',
  'fpage',
  'lpage',
  'page-range',
  'elocation-id',
  'email',
  'ext-link',
  'uri',
  'product',
  'supplementary-material',
  'history',
  'pub-history',
  'permissions',
  'self-uri',
  'related-article',
  'related-object',
  'abstract',
  'trans-abstract',
  'kwd-group',
  'funding-group',
  'support-group',
  'conference',
  'counts',
  'custom-meta-group',
];

function order(tags: (string | string[])[]): Record<string, number> {
  return Object.fromEntries(
    tags
      .map((tag, i) => {
        if (typeof tag === 'string') return [tag, i];
        return tag.map((t) => [t, i]);
      })
      .flat() as [string, number][],
  );
}

export const tableWrapOrder = order([
  'object-id',
  'label',
  'caption',
  'abstract',
  'kwd-group',
  'subj-group',
  ['alt-text', 'long-desc', 'email', 'ext-link', 'uri'],
  [
    'disp-quote',
    'speech',
    'statement',
    'verse-group',
    'def-list',
    'list',
    'alternatives',
    'chem-struct-wrap',
    'code',
    'disp-formula',
    'graphic',
    'media',
    'preformat',
    'table',
    'xref',
  ],
  ['table-wrap-foot', 'attrib', 'permissions'],
]);
