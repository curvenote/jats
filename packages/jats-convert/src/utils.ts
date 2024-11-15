import type { Node } from 'unist-util-select';
import { copyNode as mystCopyNode, toText as mystToText } from 'myst-common';
import type { ISession } from 'jats-xml';
import type { VFile } from 'vfile';

/**
 * toText function that handles newer version of unist
 */
export function toText(node: Node | undefined) {
  return mystToText(node as any);
}
/**
 * copyNode function that handles newer version of unist
 */
export function copyNode(node: Node) {
  return mystCopyNode(node as any);
}

export function logMessagesFromVFile(session: ISession, file?: VFile): void {
  if (!file) return;
  file.messages.forEach((message) => {
    const kind = message.fatal === null ? 'info' : message.fatal === false ? 'warn' : 'error';
    const note = message?.note ? `\n   Note: ${message.note}` : '';
    const url = message?.url ? `\n   See also: ${message.url}\n` : '';
    const prefix = message?.file ? `${message?.file} ` : '';
    const formatted = `${message.reason}${note}${url}`;
    switch (kind) {
      case 'info':
        session.log.info(`ℹ️  ${prefix}${formatted}`);
        break;
      case 'error':
        session.log.error(`⛔️ ${prefix}${formatted}`);
        break;
      case 'warn':
        session.log.warn(`⚠️  ${prefix}${formatted}`);
        break;
      default:
        session.log.debug(`${prefix}${formatted}`);
        break;
    }
  });
  file.messages = [];
}
