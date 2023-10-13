import fs from 'node:fs';
import path from 'node:path';
import type { GenericNode, GenericParent } from 'myst-common';
import { js2xml, xml2js } from 'xml-js';
import type { Element, DeclarationAttributes } from 'xml-js';
import { convertToUnist } from 'jats-utils';
import { xmllintValidate } from 'jats-xml';
import type { Logger } from 'myst-cli-utils';
import { tic } from 'myst-cli-utils';
import fetch from 'node-fetch';
import { createTempFolder, elementWithText, removeTempFolder, select, selectAll } from './utils.js';

export const TRANSFER = 'transfer.xml';
export const TRANSFER_DTD = 'transfer-1.0.dtd';

type Options = { log?: Logger };

export type Contact = {
  role?: string;
  name?: { surname?: string; given?: string };
  email?: string;
  phone?: string;
};

export type ServiceProvider = {
  name?: string;
  contact?: Contact;
};

export type Publication = {
  type?: string;
  title?: string;
  acronym?: string;
  contact?: Contact;
};

export type Security = {
  auth?: string;
};

export type Location = {
  provider?: ServiceProvider;
  publication?: Publication;
  security?: Security;
};

export type Instruction = {
  sequence?: string;
  instruction?: string;
};

export type ProcessingInstructions = {
  instructions?: Instruction[];
  comments?: string[];
};

export type Transfer = {
  source?: Location & Required<Pick<Location, 'provider'>>;
  destination?: Location & Required<Pick<Location, 'provider' | 'publication'>>;
  instructions?: ProcessingInstructions;
};

function extractContact(node: GenericNode | undefined): Contact | undefined {
  if (!node) return undefined;
  const role = node?.['contact-role'] || node?.role;
  const surname = select('surname', node)?.children?.[0]?.value;
  const given = select('given-names,given-name', node)?.children?.[0]?.value;
  const email = select('email', node)?.children?.[0]?.value;
  const phone = select('phone', node)?.children?.[0]?.value;
  const contact: Contact = {
    role,
    name: given || surname ? { given, surname } : undefined,
    email,
    phone,
  };
  return contact;
}

function extractProvider(node: GenericNode | undefined): ServiceProvider | undefined {
  if (!node) return undefined;
  const name = select('provider-name,name', node)?.children?.[0]?.value;
  const contact = extractContact(select('contact', node));
  const provider: ServiceProvider = { name, contact };
  return provider;
}

function extractPublication(node: GenericNode | undefined): Publication | undefined {
  if (!node) return undefined;
  const type = node._type;
  const title = select('publication-title,title', node)?.children?.[0]?.value;
  const acronym = select('acronym', node)?.children?.[0]?.value;
  const contact = extractContact(select('contact', node));
  const serviceProvider: Publication = { type, title, acronym, contact };
  return serviceProvider;
}

function extractSecurity(node: GenericNode | undefined): Security | undefined {
  if (!node) return undefined;
  const auth = select('authentication-code', node)?.children?.[0]?.value;
  if (!auth) return undefined;
  return { auth };
}

export class TransferXml {
  declaration?: DeclarationAttributes;
  doctype?: string;
  rawXML: string;
  raw: Element;
  log: Logger;
  tree: GenericParent;

  constructor(data: string, opts?: Options) {
    const toc = tic();
    this.rawXML = data;
    this.log = opts?.log ?? console;
    try {
      this.raw = xml2js(data, { compact: false }) as Element;
    } catch (error) {
      throw new Error('Problem parsing the TransferXML document, please ensure it is XML');
    }
    const { declaration, elements } = this.raw;
    this.declaration = declaration?.attributes;
    if (
      !(elements?.length === 2 && elements[0].type === 'doctype' && elements[1].name === 'transfer')
    ) {
      throw new Error('Element <transfer> is not the only element of the transfer.xml');
    }
    this.doctype = elements[0].doctype;
    const converted = convertToUnist(elements[1]);
    this.tree = select('transfer', converted) as GenericParent;
    this.log?.debug(toc('Parsed and converted transfer.xml to unist tree in %s'));
  }

  get localDtd(): string {
    // This works both compiled and in tests
    const dtd = fs.existsSync(path.join(__dirname, TRANSFER_DTD))
      ? path.join(__dirname, TRANSFER_DTD)
      : path.join(__dirname, '..', 'static', TRANSFER_DTD);
    if (fs.existsSync(dtd)) return dtd;
    throw new Error(`Unable to locate transfer DTD file ${TRANSFER_DTD} in meca lib distribution`);
  }

  async validateXml(remoteDtd?: string) {
    const tempFolder = createTempFolder();
    fs.writeFileSync(path.join(tempFolder, TRANSFER), this.rawXML);
    let dtdFile = this.localDtd;
    if (remoteDtd) {
      const data = await (await fetch(remoteDtd)).text();
      dtdFile = path.join(tempFolder, TRANSFER_DTD);
      fs.writeFileSync(dtdFile, data);
    }
    const manifestIsValid = await xmllintValidate(
      this,
      path.join(tempFolder, TRANSFER),
      dtdFile,
    ).catch(() => {
      this.log.error(`${TRANSFER} DTD validation failed`);
      return false;
    });
    removeTempFolder(tempFolder);
    return manifestIsValid;
  }

  get version(): string {
    return this.tree['transfer-version'] || this.tree.version;
  }

  get source(): Location | undefined {
    const source = select('transfer-source', this.tree) || select('source', this.tree);
    if (!source) return undefined;
    const provider = extractProvider(select('service-provider', source));
    const publication = extractPublication(select('publication', source));
    const security = extractSecurity(select('security', source));
    return { provider, publication, security };
  }

  get destination(): Location | undefined {
    const source = select('transfer-destination', this.tree) || select('destination', this.tree);
    if (!source) return undefined;
    const provider = extractProvider(select('service-provider', source));
    const publication = extractPublication(select('publication', source));
    const security = extractSecurity(select('security', source));
    return { provider, publication, security };
  }

  get instructions(): ProcessingInstructions | undefined {
    const parent = select('processing-instructions', this.tree);
    if (!parent) return undefined;
    const instructions: ProcessingInstructions['instructions'] = selectAll(
      'processing-instruction,instruction',
      parent,
    ).map((node) => ({
      sequence: node['processing-sequence'] || node.sequence,
      instruction: node.children?.[0]?.value,
    }));
    const comments: ProcessingInstructions['comments'] = selectAll(
      'processing-comments,comments',
      parent,
    ).map((node) => node.children?.[0]?.value || '');
    return { instructions, comments };
  }
}

type WriteOptions = {
  /** Some providers want a simplified XML output that changes the names of some of the XML elements. */
  simplifiedXML?: boolean;
  dtdUrl?: string;
};

function writeContactElement(opts?: WriteOptions, contact?: Contact): Element | undefined {
  if (!contact) return undefined;
  return {
    type: 'element',
    name: 'contact',
    attributes: contact.role
      ? { [opts?.simplifiedXML ? 'role' : 'contact-role']: contact.role }
      : undefined,
    elements: [
      contact.name?.surname || contact.name?.given
        ? {
            type: 'element',
            name: 'contact-name',
            elements: [
              contact.name?.surname ? elementWithText('surname', contact.name?.surname) : undefined,
              contact.name?.given ? elementWithText('given-names', contact.name?.given) : undefined,
            ].filter((e) => !!e) as Element[],
          }
        : undefined,
      contact.email ? elementWithText('email', contact.email) : undefined,
      contact.phone ? elementWithText('phone', contact.phone) : undefined,
    ].filter((e) => !!e) as Element[],
  };
}

function writeServiceProviderElement(
  opts?: WriteOptions,
  provider?: ServiceProvider,
): Element | undefined {
  if (!provider) return undefined;
  return {
    type: 'element',
    name: 'service-provider',
    elements: [
      provider.name ? elementWithText('provider-name', provider.name) : undefined,
      writeContactElement(opts, provider.contact),
    ].filter((e) => !!e) as Element[],
  };
}

function writePublicationElement(
  opts?: WriteOptions,
  publication?: Publication,
): Element | undefined {
  if (!publication) return undefined;
  return {
    type: 'element',
    name: 'publication',
    attributes: publication.type ? { type: publication.type } : undefined,
    elements: [
      publication.title
        ? elementWithText(opts?.simplifiedXML ? 'title' : 'publication-title', publication.title)
        : undefined,
      publication.acronym ? elementWithText('acronym', publication.acronym) : undefined,
      writeContactElement(opts, publication.contact),
    ].filter((e) => !!e) as Element[],
  };
}

function writeLocationElement(
  name: 'source' | 'destination',
  opts?: WriteOptions,
  location?: Location,
): Element | undefined {
  if (!location) return undefined;
  return {
    type: 'element',
    name: name === 'source' ? (opts?.simplifiedXML ? 'source' : 'transfer-source') : 'destination',
    elements: [
      writeServiceProviderElement(opts, location.provider),
      writePublicationElement(opts, location.publication),
      location.security
        ? {
            type: 'element',
            name: 'security',
            elements: [
              location.security.auth
                ? elementWithText('authentication-code', location.security.auth)
                : undefined,
            ].filter((e) => !!e),
          }
        : undefined,
    ].filter((e) => !!e) as Element[],
  };
}

function writeInstructionsElement(
  opts?: WriteOptions,
  instructions?: ProcessingInstructions,
): Element | undefined {
  if (!instructions) return undefined;
  return {
    type: 'element',
    name: 'processing-instructions',
    elements: [
      ...((instructions.instructions
        ?.map(({ instruction, sequence }) =>
          instruction
            ? elementWithText(
                opts?.simplifiedXML ? 'instruction' : 'processing-instruction',
                instruction,
                sequence
                  ? { [opts?.simplifiedXML ? 'sequence' : 'processing-sequence']: sequence }
                  : undefined,
              )
            : undefined,
        )
        .filter((e) => !!e) as Element[]) ?? []),
      ...(instructions.comments
        ?.map((comment) =>
          comment
            ? elementWithText(opts?.simplifiedXML ? 'comments' : 'processing-comments', comment)
            : undefined,
        )
        .filter((e) => !!e) as Element[]),
    ].filter((e) => !!e) as Element[],
  };
}

export function createTransferXml(transfer: Transfer, opts?: WriteOptions) {
  const element = {
    type: 'element',
    elements: [
      {
        type: 'doctype',
        doctype: `transfer PUBLIC "-//MECA//DTD Manifest v1.0//en" "${
          opts?.dtdUrl ?? 'https://meca.zip/transfer-1.0.dtd'
        }"`,
      },
      {
        type: 'element',
        name: 'transfer',
        attributes: {
          [opts?.simplifiedXML ? 'version' : 'transfer-version']: '1.0',
          xmlns: 'https://manuscriptexchange.org/schema/transfer',
        },
        elements: [
          writeLocationElement('source', opts, transfer.source),
          writeLocationElement('destination', opts, transfer.destination),
          writeInstructionsElement(opts, transfer.instructions),
        ].filter((e) => !!e) as Element[],
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
