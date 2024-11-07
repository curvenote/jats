import type { ISession as BaseISession } from 'myst-cli-utils';

export type ISession = BaseISession;

export interface Resolver {
  test: (url: string) => boolean;
  jatsUrl: (url: string) => string;
}

export type ResolutionOptions = {
  resolvers?: Resolver[];
  fetcher?: (
    url: string,
    contentType?: 'json' | 'xml',
  ) => Promise<
    Pick<Response, 'ok' | 'headers' | 'text' | 'json' | 'status' | 'statusText' | 'url'>
  >;
};

export type DownloadResult = { success: boolean; source: string; data?: string };
