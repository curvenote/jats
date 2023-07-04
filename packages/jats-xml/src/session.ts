import { chalkLogger, LogLevel } from 'myst-cli-utils';
import type { Logger } from 'myst-cli-utils';
import type { ISession } from './types.js';

function xmllintLogWrapper(logger: Logger): Logger {
  return {
    ...logger,
    error(data: string) {
      const line = data.trim();
      if (!line) return;
      if (line.includes('warning: failed to load external entity')) return;
      logger.error(data);
    },
  };
}

export class Session implements ISession {
  log: Logger;
  constructor(opts?: { logger?: Logger }) {
    this.log = xmllintLogWrapper(opts?.logger ?? chalkLogger(LogLevel.debug));
  }
}

export function getSession(logger: Logger) {
  return new Session({ logger });
}
