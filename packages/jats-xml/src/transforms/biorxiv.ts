import { toText, type GenericNode } from 'myst-common';
import { select, selectAll } from 'unist-util-select';

export function isBioRxiv(tree?: GenericNode) {
  const journalId = select('journal-id[journal-id-type=hwp]', tree);
  return toText(journalId) === 'biorxiv';
}

export function graphicToBioRxivUrl(tree?: GenericNode) {
  if (!isBioRxiv(tree)) return;
  console.log('inside graphics transform');
  const accepted = select('date[date-type=accepted]', tree);
  if (!accepted) return;
  const year = toText(select('year', accepted));
  const month = toText(select('month', accepted)).padStart(2, '0');
  const day = toText(select('day', accepted)).padStart(2, '0');
  const slug = toText(select('article-id[pub-id-type=doi]', tree)).split('/').slice(1).join('/');
  const urlBase = `https://www.biorxiv.org/content/biorxiv/early/${year}/${month}/${day}/${slug}`;
  selectAll('fig,table-wrap', tree).forEach((node: GenericNode) => {
    const figId = node['hwp:id'];
    if (!figId) return;
    const graphic = select('graphic', node) as GenericNode;
    if (!graphic) return;
    const url = `${urlBase}/${figId}.large.jpg`;
    console.log(`replacing ${graphic['xlink:href']} -> ${url}`);
    graphic['xlink:href'] = url;
  });
}
