import fs from 'node:fs';
import path from 'node:path';
import type { Root } from 'myst-spec';
import { unified } from 'unified';
import { doi } from 'doi-utils';
import type { Plugin } from 'unified';
import { VFile } from 'vfile';
import yaml from 'js-yaml';
import type { MessageInfo, GenericNode, GenericParent } from 'myst-common';
import { copyNode, fileError, RuleId, normalizeLabel } from 'myst-common';
import { select, selectAll } from 'unist-util-select';
import { u } from 'unist-builder';
import type { License, LinkMixin } from 'jats-tags';
import { RefType } from 'jats-tags';
import { Jats } from 'jats-xml';
import { MathMLToLaTeX } from 'mathml-to-latex';
import { js2xml } from 'xml-js';
import type { Handler, IJatsParser, JatsResult, Options, StateData } from './types.js';
import {
  basicTransformations,
  citationToMixedCitation,
  journalTransforms,
} from './transforms/index.js';
import type { ProjectFrontmatter } from 'myst-frontmatter';
import { abstractTransform, descriptionFromAbstract } from './transforms/abstract.js';
import { processJatsReferences, resolveJatsCitations } from './transforms/references.js';
import { backToBodyTransform } from './transforms/footnotes.js';
import version from './version.js';
import { toText } from './utils.js';
import { inlineCitationsTransform } from './myst/inlineCitations.js';
import { abbreviationSectionTransform } from './transforms/abbreviations.js';

function refTypeToReferenceKind(kind?: RefType): string | undefined {
  switch (kind) {
    case RefType.sec:
      return 'heading';
    case RefType.fig:
      return 'figure';
    case RefType.dispFormula:
      return 'equation';
    case RefType.table:
      return 'table';
    case RefType.custom:
      return undefined;
  }
}

function texMathFromNode(node: GenericNode) {
  const texMath = select('tex-math', node) as GenericNode;
  if (texMath && texMath.children?.[0].cdata) {
    return texMath.children?.[0].cdata;
  }
  selectAll('*', node).forEach((n: any) => {
    if (n.type.startsWith('mml:')) {
      n.type = n.type.substring(4);
    }
  });
  const math = select('math', node) as GenericNode;
  if (!math) return;
  [math, ...selectAll('math *', node)].forEach((n: any) => {
    const { type, value, children, ...attributes } = n;
    if (type === 'text') {
      n.type = 'text';
      n.text = value;
      delete n.value;
    } else {
      n.type = 'element';
      n.name = type;
      n.elements = children;
      n.attributes = attributes;
      delete n.children;
      Object.keys(attributes).forEach((k) => {
        delete n[k];
      });
    }
  });
  return MathMLToLaTeX.convert(js2xml({ type: 'element', name: 'root', elements: [math] }));
}

type Attributes = Record<string, any>;

const handlers: Record<string, Handler> = {
  body(node, state) {
    state.renderChildren(node);
  },
  text(node, state) {
    state.text(node.value);
  },
  p(node, state) {
    state.renderInline(node, 'paragraph');
  },
  heading(node, state) {
    state.renderInline(node, 'heading', {
      enumerated: true,
      label: node.id,
      identifier: node.id,
      depth: node.depth,
    });
  },
  block(node, state) {
    state.renderInline(node, 'block', { data: { part: node.part ?? node['sec-type'] } });
  },
  ['disp-quote'](node, state) {
    state.renderInline(node, 'blockquote', { kind: node['content-type'] });
  },
  // definitionList(node, state) {
  //   state.renderInline(node, 'def-list');
  // },
  // definitionItem(node, state) {
  //   state.renderInline(node, 'def-item');
  // },
  // definitionTerm(node, state) {
  //   state.renderInline(node, 'term');
  // },
  // definitionDescription(node, state) {
  //   state.renderInline(node, 'def');
  // },
  // code(node, state) {
  //   const { lang } = node as Code;
  //   state.renderInline(node, 'code', { language: lang });
  // },
  list(node, state) {
    // https://jats.nlm.nih.gov/archiving/tag-library/1.3/element/list.html
    state.renderInline(node, 'list', {
      ordered: node['list-type'] === 'ordered',
    });
  },
  ['list-item'](node, state) {
    state.renderInline(node, 'listItem');
  },
  thematicBreak(node, state) {
    // This comes from intermediate transforms, not JATS source
    state.addLeaf('thematicBreak');
  },
  ['inline-formula'](node, state) {
    const texMath = texMathFromNode(node);
    if (texMath) {
      state.addLeaf('inlineMath', {
        value: texMath,
        label: node.id,
        identifier: node.id,
      });
    } else {
      state.renderChildren(node);
    }
  },
  ['disp-formula'](node, state) {
    const texMath = texMathFromNode(node);
    if (texMath) {
      state.addLeaf('math', {
        value: texMath,
        label: node.id,
        identifier: node.id,
      });
    } else {
      state.renderChildren(node);
    }
  },
  bold(node, state) {
    state.renderInline(node, 'strong');
  },
  italic(node, state) {
    state.renderInline(node, 'emphasis');
  },
  underline(node, state) {
    state.renderInline(node, 'underline');
  },
  monospace(node, state) {
    state.renderInline(node, 'inlineCode');
  },
  sub(node, state) {
    state.renderInline(node, 'subscript');
  },
  sup(node, state) {
    state.renderInline(node, 'superscript');
  },
  strike(node, state) {
    state.renderInline(node, 'delete');
  },
  sc(node, state) {
    state.renderInline(node, 'smallcaps');
  },
  // break(node, state) {
  //   // https://jats.nlm.nih.gov/archiving/tag-library/1.3/element/break.html
  //   state.addLeaf('break');
  // },
  // // abbreviation(node, state) {
  // //   // TODO: \newacronym{gcd}{GCD}{Greatest Common Divisor}
  // //   // https://www.overleaf.com/learn/latex/glossaries
  // //   state.renderChildren(node, true);
  // // },
  ['ext-link'](node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  uri(node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  ['boxed-text'](node, state) {
    state.renderInline(node, 'admonition', { kind: 'info' });
  },
  admonitionTitle(node, state) {
    // This is created in a transform!
    state.renderInline(node, 'admonitionTitle');
  },
  // attrib(node, state) {
  //   // This is used inside of disp-quotes
  //   state.renderInline(node, 'attrib');
  // },
  // image(node, state) {
  //   if (node.url?.startsWith('http')) {
  //     state.warn(`Image URL is remote (${node.url})`, node, 'image');
  //   }
  //   if (state.data.isInContainer && node.alt) {
  //     state.openNode('alt-text');
  //     state.text(node.alt);
  //     state.closeNode();
  //   }
  //   // TOOD: identifier?
  //   state.addLeaf('graphic', { 'xlink:href': node.url });
  // },
  ['fig-group'](node, state) {
    state.openNode('tabSet');
    node.children?.forEach((n) => {
      state.openNode('tabItem', {
        title: toText(select('label', n)),
        sync: toText(select('label', n)),
      });
      state.renderChildren({ children: [n] });
      state.closeNode();
    });
    state.closeNode();
  },
  graphic(node, state) {
    const link = node?.['xlink:href'];
    state.addLeaf('image', { url: link });
  },
  fig(node, state) {
    const caption = select('caption', node) as GenericNode;
    const graphic = select('graphic', node) as GenericNode;
    const title = select('title', node) as GenericNode;
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('container', { label, identifier, kind: 'figure' });
    const wasInContainer = state.data.isInContainer;
    state.data.isInContainer = true;
    const link = graphic?.['xlink:href'];
    if (link) {
      state.addLeaf('image', { url: link });
    }
    state.openNode('caption');
    if (title) {
      state.openNode('strong');
      state.renderChildren(title);
      state.closeNode();
    }
    // caption number?
    if (caption) {
      state.renderChildren(caption);
    }
    state.closeNode();
    state.closeNode();
    state.data.isInContainer = wasInContainer;
  },
  ['table-wrap'](node, state) {
    const captionNode = select('caption', node) as GenericNode | undefined;
    const labelNode = select('label', node) as GenericNode | undefined;
    const titleNode = select('title', node) as GenericNode | undefined;
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('container', { label, identifier, kind: 'table' });
    const wasInContainer = state.data.isInContainer;
    state.data.isInContainer = true;
    state.openNode('caption');
    if (titleNode) {
      state.openNode('strong');
      state.renderChildren(titleNode);
      state.closeNode();
      titleNode.type = '__ignore__';
    }
    if (captionNode || labelNode) {
      state.renderChildren(captionNode || labelNode);
      if (captionNode) captionNode.type = '__ignore__';
      if (labelNode) labelNode.type = '__ignore__';
    }
    state.closeNode();
    state.renderChildren(node);
    state.closeNode();
    state.data.isInContainer = wasInContainer;
  },
  table(node, state) {
    state.openNode('table');
    state.renderChildren(node);
    state.closeNode();
  },
  thead(node, state) {
    state.renderChildren(node);
  },
  tbody(node, state) {
    state.renderChildren(node);
  },
  tfoot(node, state) {
    state.renderChildren(node);
  },
  tr(node, state) {
    state.openNode('tableRow');
    state.renderChildren(node);
    state.closeNode();
  },
  th(node, state) {
    const { align, colspan, rowspan } = node;
    state.openNode('tableCell', { header: true, align, colspan, rowspan });
    state.renderChildren(node);
    state.closeNode();
  },
  td(node, state) {
    const { align, colspan, rowspan } = node;
    state.openNode('tableCell', { align, colspan, rowspan });
    state.renderChildren(node);
    state.closeNode();
  },
  ['table-wrap-foot'](node, state) {
    state.openNode('legend');
    state.renderChildren(node);
    state.closeNode();
  },
  hr(node, state) {
    if (state.data.isInContainer) return;
    state.addLeaf('thematicBreak');
  },
  break(node, state) {
    state.addLeaf('break');
  },
  ['named-content'](node, state) {
    // TODO: Not just ignore things marked as named-content
    state.renderChildren(node);
  },
  // container(node, state) {
  //   state.data.isInContainer = true;
  //   switch (node.kind) {
  //     case 'figure': {
  //       state.renderInline(node, 'fig');
  //       break;
  //     }
  //     case 'table': {
  //       state.renderInline(node, 'table-wrap');
  //       break;
  //     }
  //     case 'quote': {
  //       // This is transformed in containers.ts
  //       state.renderChildren(node);
  //       break;
  //     }
  //     case 'code': {
  //       // This is transformed in containers.ts
  //       state.renderInline(node, 'boxed-text', { 'content-type': node.kind });
  //       break;
  //     }
  //     default: {
  //       state.error(`Unhandled container kind of ${node.kind}`, node, 'container');
  //       state.renderChildren(node);
  //     }
  //   }
  //   delete state.data.isInContainer;
  // },
  // caption(node, state) {
  //   state.renderInline(node, 'caption');
  // },
  // captionNumber(node, state) {
  //   state.renderInline(node, 'label');
  // },
  // crossReference(node, state) {
  //   // Look up reference and add the text
  //   const { identifier, kind } = node as CrossReference;
  //   const attrs: Attributes = { 'ref-type': referenceKindToRefType(kind), rid: identifier };
  //   if (attrs['ref-type'] === RefType.custom && kind) {
  //     attrs['custom-type'] = kind;
  //   }
  //   state.renderInline(node, 'xref', attrs);
  // },
  // citeGroup(node, state) {
  //   if (state.options.citestyle === 'numerical-only') {
  //     state.write('\\cite{');
  //   } else if (state.options.bibliography === 'biblatex') {
  //     const command = node.kind === 'narrative' ? 'textcite' : 'parencite';
  //     state.write(`\\${command}{`);
  //   } else {
  //     const tp = node.kind === 'narrative' ? 't' : 'p';
  //     state.write(`\\cite${tp}{`);
  //   }
  //   state.renderChildren(node, true, ', ');
  //   state.write('}');
  // },
  // cite(node, state, parent) {
  //   if (!state.options.bibliography) {
  //     state.usePackages('natbib');
  //     // Don't include biblatex in the package list
  //   }
  //   if (parent.type === 'citeGroup') {
  //     state.write(node.label);
  //   } else if (state.options.bibliography === 'biblatex') {
  //     state.write(`\\textcite{${node.label}}`);
  //   } else {
  //     state.write(`\\cite{${node.label}}`);
  //   }
  // },
  ['fn-group'](node, state) {
    state.renderChildren(node);
  },
  fn(node, state) {
    const { label, identifier } = normalizeLabel(node.id) ?? {};
    state.openNode('footnoteDefinition', { label, identifier });
    state.renderChildren(node);
    state.closeNode();
  },
  xref(node, state) {
    const refType: RefType = node['ref-type'];
    const { label, identifier } = normalizeLabel(node.rid) ?? {};
    switch (refType) {
      case RefType.bibr:
      case RefType.ref:
        state.renderInline(node, 'cite', {
          label,
          identifier,
          kind: 'narrative',
        });
        return;
      case RefType.sec:
      case RefType.fig:
      case RefType.dispFormula:
      case RefType.table: {
        const kind = refTypeToReferenceKind(refType);
        state.renderInline(node, 'crossReference', { label, identifier, kind });
        return;
      }
      case RefType.fn:
      case RefType.tableFn: {
        state.renderInline(node, 'footnoteReference', { label, identifier });
        return;
      }
      default: {
        state.renderInline(node, 'crossReference', { identifier: node.rid });
        state.warn(`Unknown ref-type of ${refType}`, node);
        return;
      }
    }
  },
  ['supplementary-material'](node, state) {
    state.renderChildren(node);
  },
  media(node, state) {
    state.renderInline(node, 'link', { url: node['xlink:href'] });
  },
  caption(node, state) {
    state.renderChildren(node);
  },
  // These nodes can be safely ignored
  label() {},
  comment() {},
  __ignore__() {},
  // TODO: Maybe more interesting things we can do with these sometime...
  ['object-id']() {
    // These are defined on figures/tables to give them ids, e.g. DOIs
  },
};

const DEFAULT_HANDLERS = { ...handlers };

export class JatsParser implements IJatsParser {
  file: VFile;
  data: StateData;
  options: Options;
  handlers: Record<string, Handler>;
  stack: GenericNode[] = [];
  jats: Jats;

  unhandled: string[] = [];

  constructor(file: VFile, jats: Jats, opts?: Options) {
    this.file = file;
    this.jats = jats;
    this.options = opts ?? {};
    this.data = {};
    this.stack = [{ type: 'root', children: [] }];
    this.handlers = opts?.handlers ?? DEFAULT_HANDLERS;
  }

  top() {
    return this.stack[this.stack.length - 1];
  }

  warn(message: string, node: GenericNode, source?: string, opts?: MessageInfo) {
    fileError(this.file, message, {
      ...opts,
      node,
      source: source ? `jats-convert:${source}` : 'jats-convert',
      ruleId: RuleId.jatsParses,
    });
  }

  error(message: string, node: GenericNode, source?: string, opts?: MessageInfo) {
    fileError(this.file, message, {
      ...opts,
      node,
      source: source ? `jats-convert:${source}` : 'jats-convert',
      ruleId: RuleId.jatsParses,
    });
  }

  pushNode(el?: GenericNode) {
    const top = this.top();
    if (this.stack.length && el && 'children' in top) top.children?.push(el);
    return el;
  }

  text(text?: string) {
    const top = this.top();
    const value = text;
    if (!value || !this.stack.length || !('children' in top)) return;
    const last = top.children?.[top.children.length - 1];
    if (last?.type === 'text') {
      // The last node is also text, merge it
      last.value += `${value}`;
      return last;
    }
    const node = u('text', value);
    top.children?.push(node);
    return node;
  }

  renderChildren(node: GenericNode) {
    node.children?.forEach((child) => {
      const handler = this.handlers[child.type];
      if (handler) {
        handler(child, this, node);
      } else {
        this.unhandled.push(child.type);
        fileError(this.file, `Unhandled JATS conversion for node of "${child.type}"`, {
          source: 'jats-convert',
          ruleId: RuleId.jatsParses,
        });
      }
    });
  }

  renderInline(node: GenericNode, name: string, attributes?: Attributes) {
    this.openNode(name, { ...attributes });
    if ('children' in node) {
      this.renderChildren(node);
    } else if ('value' in node && node.value) {
      this.text(node.value);
    }
    this.closeNode();
  }

  addLeaf(name: string, attributes?: Attributes) {
    this.openNode(name, attributes, true);
    this.closeNode();
  }

  openNode(name: string, attributes?: Attributes, isLeaf = false) {
    const node: GenericNode = { type: name, ...attributes };
    if (!isLeaf) node.children = [];
    this.stack.push(node);
  }

  closeNode() {
    const node = this.stack.pop();
    return this.pushNode(node);
  }
}

export const jatsConvertPlugin: Plugin<[Jats, Options?], Root, Root> = function (jats, opts) {
  this.Compiler = (node: GenericParent, file: VFile) => {
    if (jats.abstract) abstractTransform(jats.abstract);
    const tree = jats.abstract
      ? {
          type: 'root',
          children: [
            u('block', { part: 'abstract' }, copyNode(jats.abstract).children),
            ...copyNode(node).children,
          ],
        }
      : copyNode(node);
    // Can do better than this in the future, but for now, just put them at the end!
    const floatsGroup = selectAll('floats-group', jats.tree) as GenericParent[];
    if (floatsGroup.length > 0) {
      floatsGroup.forEach((g) => {
        tree.children.push(...g.children);
      });
    }
    basicTransformations(tree, file);
    citationToMixedCitation(tree);
    journalTransforms(tree);
    const state = new JatsParser(file, jats, opts ?? { handlers });
    state.renderChildren(tree);
    while (state.stack.length > 1) state.closeNode();
    if (state.unhandled.length && opts?.logInfo) {
      opts.logInfo.unhandled = [...new Set(state.unhandled)];
    }
    const referenceData = Object.fromEntries(
      jats.references.map((bibr) => {
        const id = bibr.id;
        const names = selectAll('name,string-name', bibr)
          .map((n) => `${toText(select('surname', n))}, ${toText(select('given-names', n))}`)
          .join(', ');
        const year = toText(select('year', bibr));
        const title = toText(select('article-title', bibr));
        const source = toText(select('source', bibr));
        const volume = toText(select('volume', bibr));
        const fpage = toText(select('fpage', bibr));
        const lpage = toText(select('lpage', bibr));
        const doiElement = selectAll('ext-link,[pub-id-type=doi]', bibr).find((e) =>
          doi.validate(toText(e)),
        );
        const doiString = doiElement ? toText(doiElement) : undefined;
        const doiLink = doiString ? ` <a href=${doi.buildUrl(doiString)}>${doiString}</a>` : '';
        return [
          id,
          {
            html: `${names}. (${year}). ${title}. <i>${source}</i>, <i>${volume}</i>, ${fpage}-${lpage}.${doiLink}`,
            doi: doiString,
          },
        ];
      }),
    );

    const referenceOrder: string[] = [];
    const xrefs = selectAll('xref[ref-type=bibr]', jats.body) as GenericNode[];
    xrefs.forEach((xref) => {
      const rid = xref.rid;
      if (!referenceOrder.includes(rid)) {
        referenceOrder.push(rid);
      }
    });
    const result: JatsResult = {
      references: { order: referenceOrder, data: referenceData },
      tree: state.stack[0] as Root,
    };
    file.result = result;
    return file;
  };

  return (node: Root) => {
    return node;
  };
};

export async function jatsConvertTransform(
  data: string | Jats,
  opts?: Options,
): Promise<{
  tree: Root;
  jats: Jats;
  file: VFile;
  references: any;
  frontmatter: Omit<ProjectFrontmatter, 'license'> & { license?: string };
}> {
  const jats = typeof data === 'string' ? new Jats(data) : data;
  if (opts?.logInfo) {
    opts.logInfo.publisher = toText(select('publisher-name', jats.tree)) || null;
    opts.logInfo.journal = toText(select('journal-title', jats.tree)) || null;
    opts.logInfo.pmid = toText(select('article-id[pub-id-type=pmid]', jats.tree)) || null;
    opts.logInfo.pmc = toText(select('article-id[pub-id-type=pmc]', jats.tree)) || null;
    opts.logInfo.doi = toText(select('article-id[pub-id-type=doi]', jats.tree)) || null;
    opts.logInfo.year = toText(select('year', jats.publicationDate)) || null;
    const license = select('license', jats.tree) as License | undefined;
    let licenseString: string | null = null;
    if (license?.['xlink:href']) {
      licenseString = license['xlink:href'];
    } else if (select('[type=ali\\:license_ref]', license)) {
      licenseString = toText(select('[type=ali\\:license_ref]', license));
    } else if (selectAll('ext-link', license).length === 1) {
      licenseString = (select('ext-link', license) as LinkMixin)['xlink:href'] ?? null;
    } else if (license) {
      licenseString = toText(license);
    }
    opts.logInfo.license = licenseString;
  }
  const { frontmatter } = jats;
  const file = new VFile();
  const refLookup = await processJatsReferences(jats, opts);
  backToBodyTransform(jats);
  const pipe = unified().use(jatsConvertPlugin, jats, opts);
  const vfile = pipe.stringify((jats.body ?? { type: 'body', children: [] }) as any, file);
  const references = (vfile as any).result.references as JatsResult['references'];
  const tree = (vfile as any).result.tree as Root;
  resolveJatsCitations(tree, refLookup);
  inlineCitationsTransform(tree, [...Object.keys(references.data)]);
  abbreviationSectionTransform(tree, frontmatter);
  const abstract = selectAll('block', tree).find((node) => {
    return node.data && (node.data as any).part === 'abstract';
  });
  if (abstract) {
    frontmatter.description = descriptionFromAbstract(toText(abstract));
  }
  if (opts?.logInfo) {
    opts.logInfo.figures = {
      body: selectAll('fig', jats.body).length,
      back: selectAll('fig', jats.back).length,
      myst: selectAll('container[kind=figure]', tree).length,
    };
    opts.logInfo.tables = {
      body: selectAll('table-wrap', jats.body).length,
      back: selectAll('table-wrap', jats.back).length,
      myst: selectAll('container[kind=table]', tree).length,
    };
    opts.logInfo.math = {
      inline: {
        body: selectAll('inline-formula', jats.body).length,
        back: selectAll('inline-formula', jats.back).length,
        myst: selectAll('inlineMath', tree).length,
      },
      equations: {
        body: selectAll('disp-formula', jats.body).length,
        back: selectAll('disp-formula', jats.back).length,
        myst: selectAll('math', tree).length,
      },
    };
    opts.logInfo.footnotes = {
      body: selectAll('fn', jats.body).length,
      back: selectAll('fn', jats.back).length,
      myst: selectAll('footnoteDefinition', tree).length,
    };
  }
  return { tree, jats, file, references, frontmatter }; //, kind };
}

export async function jatsConvert(
  input: string,
  opts?: { frontmatter?: 'page' | 'project'; dois?: boolean },
) {
  const logInfo: Record<string, any> = { jatsVersion: version };
  const dir = path.dirname(input);
  const { tree, frontmatter } = await jatsConvertTransform(fs.readFileSync(input).toString(), {
    dir,
    logInfo,
    dois: opts?.dois,
  });
  const basename = path.basename(input, path.extname(input));
  const mystJson = path.join(dir, `${basename}.myst.json`);
  const mystYml = path.join(dir, 'myst.yml');
  const logJson = path.join(dir, `${basename}.log.json`);
  const logYml = path.join(dir, `${basename}.log.yml`);
  fs.writeFileSync(logJson, JSON.stringify(logInfo, null, 2));
  fs.writeFileSync(logYml, yaml.dump(logInfo));
  if (opts?.frontmatter === 'page') {
    fs.writeFileSync(mystJson, JSON.stringify({ mdast: tree, frontmatter }, null, 2));
  } else if (opts?.frontmatter === 'project') {
    if (fs.existsSync(mystYml)) {
      // console.log('myst.yml exists; overriding with frontmatter from JATS');
      const previous = yaml.load(fs.readFileSync(mystYml).toString()) as {
        version: number;
        project: ProjectFrontmatter;
        site: Record<string, any>;
      };
      fs.writeFileSync(
        mystYml,
        yaml.dump({ ...previous, project: { ...previous.project, ...frontmatter } }),
      );
    } else {
      // console.log(`writing new myst.yml file`);
      fs.writeFileSync(mystYml, yaml.dump({ version: 1, project: frontmatter, site: {} }));
    }
    fs.writeFileSync(mystJson, JSON.stringify({ mdast: tree }, null, 2));
  } else {
    // console.log(`ignoring frontmatter`);
    fs.writeFileSync(mystJson, JSON.stringify({ mdast: tree }, null, 2));
  }
}
