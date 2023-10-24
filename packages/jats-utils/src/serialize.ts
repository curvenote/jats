import { js2xml, type Element } from 'xml-js';
import { escapeForXML } from './utils.js';

export type SerializationOptions = {
  /**
   * When 'pretty', the default, the xml be formatted in a custom, opinionated way
   * When 'flat', the xml will be on a single line
   * When `0`, the XML will be on different lines with 0 spaces.
   * When any other value (e.g. `2` or `\t`) the XML will be indented at the start of the line by that amount.
   */
  format?: number | 'flat' | 'pretty' | '\t';
};

const both = [
  '\\?xml',
  'article',
  'sub-article',
  'front',
  'front-stub',
  'journal-meta',
  'journal-title-group',
  'publisher',
  'article-meta',
  'article-categories',
  'title-group',
  'contrib-group',
  'contrib',
  'institution-wrap',
  'aff',
  'permissions',
  'license',
  'kwd-group',
  'history',
  'self-uri',
  'funding-group',
  'award-group',
  'principal-award-recipient',
  'custom-meta-group',
  'date',
  'pub-date',
  'abstract',
  'counts',
  'body',
  'sec',
  'fig',
  'statement',
  'list',
  'disp-formula',
  'disp-formula-group',
  'table-wrap',
  'caption',
  'table',
  'thead',
  'ref-list',
  'ref',
  'back',
];
const first = [
  'journal-id',
  'journal-title',
  'issn',
  'publisher-name',
  'publisher-loc',
  'article-id',
  'article-title',
  'alt-title',
  'subtitle',
  'kwd',
  'name',
  'email',
  'contrib-id',
  'role',
  'institution',
  'institution-id',
  'award-id',
  'meta-name',
  'meta-value',
  'title',
  'p',
  'license-p',
  'tr',
  'label',
  'graphic',
  'mixed-citation',
];

function indentXML(xml: string): string {
  return xml
    .replace(RegExp(`<(\\/)?(${both.join('|')})( [^>]*)?>`, 'g'), '<$1$2$3>\n')
    .replace(RegExp(`([^\n])<(\\/)?(${both.join('|')})( [^>]*)?>`, 'g'), '$1\n<$2$3$4>')
    .replace(RegExp(`([^\n])<(${first.join('|')})( [^>]*)?>`, 'g'), '$1\n<$2$3>')
    .replace(RegExp(`<\\/(${first.join('|')})(\\s*)>([^\n])`, 'g'), '</$1>\n$3');
}

export function serializeJatsXml(element: Element, opts?: SerializationOptions) {
  const { format }: SerializationOptions = { format: 'pretty', ...opts };
  const xml = js2xml(element, {
    compact: false,
    //  No way to write XML with new lines, but no indentation with js2xml.
    // If you use 0 or '', you get a single line.
    spaces: format === 'flat' || format === 'pretty' ? 0 : format || 1,
    attributeValueFn: escapeForXML,
  });
  if (format === 0) {
    // either `0` or `''`
    return xml.replace(/\n(\s*)</g, '\n<');
  } else if (format === 'pretty') {
    return indentXML(xml);
  }
  return xml;
}
