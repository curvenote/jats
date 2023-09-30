import fs from 'node:fs';
import path from 'node:path';
import type { GenericParent } from 'myst-common';
import { js2xml, xml2js } from 'xml-js';
import type { Element, DeclarationAttributes } from 'xml-js';
import { convertToUnist, xmllintValidate } from 'jats-xml';
import type { Logger } from 'myst-cli-utils';
import { tic } from 'myst-cli-utils';
import { createTempFolder, elementWithText, removeTempFolder, select, selectAll } from './utils.js';

export const MANIFEST = 'manifest.xml';
export const MANIFEST_DTD = 'manifest-1.0.dtd';

type Options = { log?: Logger; source?: string };

export enum ItemTypes {
  articleMetadata = 'article-metadata',
  articleSupportingFile = 'article-supporting-file',
  manuscript = 'manuscript',
  manuscriptSupportingFile = 'manuscript-supporting-file',
  articleSource = 'article-source',
  articleSourceEnvironment = 'article-source-environment',
  articleSourceDirectory = 'article-source-directory',
  transferMetadata = 'transfer-metadata',
}

export type ManifestItem = {
  id?: string;
  itemType?: string;
  version?: string;
  title?: string;
  description?: string;
  href: string;
  mediaType?: string;
  fileOrder?: string;
  metadata?: Record<string, string>;
};

export class ManifestXml {
  declaration?: DeclarationAttributes;
  doctype?: string;
  rawXML: string;
  raw: Element;
  log: Logger;
  tree: GenericParent;
  source?: string;

  constructor(data: string, opts?: Options) {
    const toc = tic();
    this.log = opts?.log ?? console;
    this.rawXML = data;
    if (opts?.source) this.source = opts.source;
    try {
      this.raw = xml2js(data, { compact: false }) as Element;
    } catch (error) {
      throw new Error('Problem parsing the TransferXML document, please ensure it is XML');
    }
    const { declaration, elements } = this.raw;
    this.declaration = declaration?.attributes;
    if (
      !(elements?.length === 2 && elements[0].type === 'doctype' && elements[1].name === 'manifest')
    ) {
      throw new Error('Element <manifest> is not the only element of the manifest.xml');
    }
    this.doctype = elements[0].doctype;
    const converted = convertToUnist(elements[1]);
    this.tree = select('manifest', converted) as GenericParent;
    this.log?.debug(toc('Parsed and converted manifest.xml to unist tree in %s'));
  }

  get localDtd(): string {
    // This works both compiled and in tests
    const dtd = fs.existsSync(path.join(__dirname, MANIFEST_DTD))
      ? path.join(__dirname, MANIFEST_DTD)
      : path.join(__dirname, '..', 'static', MANIFEST_DTD);
    if (fs.existsSync(dtd)) return dtd;
    throw new Error(`Unable to locate manifest DTD file ${MANIFEST_DTD} in meca lib distribution`);
  }

  async validateXml(remoteDtd?: string) {
    const tempFolder = createTempFolder();
    fs.writeFileSync(path.join(tempFolder, MANIFEST), this.rawXML);
    let dtdFile = this.localDtd;
    if (remoteDtd) {
      const data = await (await fetch(remoteDtd)).text();
      dtdFile = path.join(tempFolder, MANIFEST_DTD);
      fs.writeFileSync(dtdFile, data);
    }
    const manifestIsValid = await xmllintValidate(
      this,
      path.join(tempFolder, MANIFEST),
      dtdFile,
    ).catch(() => {
      this.log.error(`${MANIFEST} DTD validation failed`);
      return false;
    });
    removeTempFolder(tempFolder);
    return manifestIsValid;
  }

  get version(): string {
    return this.tree['manifest-version'] || this.tree.version;
  }

  get items(): ManifestItem[] {
    const items = selectAll(`item`, this.tree)
      .map((item): ManifestItem | undefined => {
        const instances = selectAll(`instance`, item);
        if (instances.length === 0) {
          this.log.warn('Item without an instance');
          return undefined;
        }
        if (instances.length > 1) {
          this.log.warn('Item has multiple instances, only the first is used.');
        }
        const instance = instances[0];
        const title = select(`item-title`, item)?.children?.[0].value;
        const description = select(`item-description`, item)?.children?.[0].value;
        const fileOrder = select(`file-order`, item)?.children?.[0].value;
        const metadata = Object.fromEntries(
          selectAll('metadata', item)?.map((n) => [
            n['metadata-name'] || n.name,
            n?.children?.[0].value,
          ]) ?? [],
        );
        return {
          id: item.id,
          itemType: item['item-type'],
          version: item['item-version'] || item['version'],
          title,
          description,
          href: instance['xlink:href'] || instance.href,
          mediaType: instance['media-type'],
          fileOrder,
          metadata,
        };
      })
      .filter((item): item is ManifestItem => !!item);
    return items;
  }

  get itemTypes(): string[] {
    const itemTypes = new Set<string>();
    this.items.forEach((item) => {
      if (item.itemType) itemTypes.add(item.itemType);
    });
    return [...itemTypes];
  }

  get articleMetadata(): ManifestItem | undefined {
    const items = this.items.filter((item) => item.itemType === ItemTypes.articleMetadata);
    if (items.length > 1) this.log.warn('More than 1 article metadata found');
    return items[0];
  }

  get transferMetadata(): ManifestItem[] {
    return this.items.filter((item) => item.itemType === ItemTypes.transferMetadata);
  }
}

type WriteOptions = {
  /** Some publishers prefer `href` instead of `xlink:href`, which is in the spec */
  noXLink?: boolean;
  dtdUrl?: string;
};

function writeManifestItem(item: ManifestItem, opts?: WriteOptions): Element {
  const { id, version, href, itemType, mediaType, title, description, fileOrder, metadata } = item;
  return {
    type: 'element',
    name: 'item',
    attributes: {
      id,
      'item-type': itemType,
      'item-version': version,
    },
    elements: (
      [
        title ? elementWithText('item-title', title) : undefined,
        description ? elementWithText('item-description', description) : undefined,
        fileOrder ? elementWithText('file-order', fileOrder) : undefined,
        metadata && Object.keys(metadata ?? {}).length > 0
          ? {
              type: 'element',
              name: 'item-metadata',
              elements: Object.entries(metadata).map(([k, v]) =>
                elementWithText('metadata', v, { 'metadata-name': k }),
              ),
            }
          : undefined,
        {
          type: 'element',
          name: 'instance',
          attributes: {
            [opts?.noXLink ? 'href' : 'xlink:href']: href,
            'media-type': mediaType,
          },
        },
      ] as Element[]
    ).filter((e) => !!e),
  };
}

export function createManifestXml(manifestItems: ManifestItem[], opts?: WriteOptions) {
  const element = {
    type: 'element',
    elements: [
      {
        type: 'doctype',
        doctype: `manifest PUBLIC "-//MECA//DTD Manifest v1.0//en" "${
          opts?.dtdUrl ?? 'https://meca.zip/manifest-1.0.dtd'
        }"`,
      },
      {
        type: 'element',
        name: 'manifest',
        attributes: {
          'manifest-version': '1',
          xmlns: 'https://manuscriptexchange.org/schema/manifest',
          ...(opts?.noXLink ? {} : { 'xmlns:xlink': 'http://www.w3.org/1999/xlink' }),
        },
        elements: manifestItems.map((item) => writeManifestItem(item, opts)),
      },
    ],
    declaration: { attributes: { version: '1.0', encoding: 'UTF-8' } },
  };
  const manifest = js2xml(element, {
    compact: false,
    spaces: 2,
  });
  return manifest;
}
