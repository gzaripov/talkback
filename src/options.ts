import Logger from './logger';
import { Tape } from './tape';
import { Agent } from 'https';
import { Request } from './http';

export type RecordMode =
  | 'NEW' // If no tape matches the request, proxy it and save the response to a tape
  | 'OVERWRITE' // Always proxy the request and save the response to a tape, overwriting any existing one
  | 'DISABLED'; // If a matching tape exists, return it. Otherwise, don't proxy the request and use `fallbackMode` for the response

export type FallbackMode = 'NOT_FOUND' | 'PROXY';

export const RecordModes: RecordMode[] = ['NEW', 'OVERWRITE', 'DISABLED'];
export const FallbackModes: FallbackMode[] = ['NOT_FOUND', 'PROXY'];

export type UserOptions = {
  proxyUrl: string;
  talkbackUrl?: string;
  tapesPath?: string;
  recordMode?: RecordMode | ((request: Request) => RecordMode);
  fallbackMode?: FallbackMode | ((request: Request) => FallbackMode);
  name?: string;
  tapeNameGenerator?: (tape: Tape, tapeId: number) => string;
  tapePathGenerator?: (tape: Request) => string;
  https?: {
    keyPath: string;
    certPath: string;
  };
  agent?: Agent;
  ignoreQueryParams?: string[];
  ignoreAllQueryParams?: boolean;
  ignoreHeaders?: string[];
  ignoreAllHeaders?: boolean;
  ignoreBody?: boolean;
  tapeMatcher?: (tape: Tape, request: Request) => boolean;
  tapeDecorator?: (tape: Tape) => Tape;
  silent?: boolean;
  summary?: boolean;
  debug?: boolean;
  logger?: Logger;
};

const defaultOptions = {
  talkbackUrl: 'localhost:8080',
  recordMode: 'NEW' as RecordMode | ((request: Request) => RecordMode),
  fallbackMode: 'NOT_FOUND' as FallbackMode | ((request: Request) => FallbackMode),
  name: 'unnamed',
  ignoreHeaders: ['content-length', 'host'],
  silent: false,
  summary: true,
  debug: false,
  logger: new Logger(),
};

export type Options = UserOptions & typeof defaultOptions;

export function validateRecord(record?: RecordMode | ((request: Request) => RecordMode)) {
  if (typeof record === 'string' && !RecordModes.includes(record)) {
    throw new Error(`INVALID OPTION: record has an invalid value of '${record}'`);
  }
}

export function validateFallbackMode(
  fallbackMode?: FallbackMode | ((request: Request) => FallbackMode),
) {
  if (typeof fallbackMode === 'string' && !FallbackModes.includes(fallbackMode)) {
    throw new Error(`INVALID OPTION: fallbackMode has an invalid value of '${fallbackMode}'`);
  }
}

function validateOptions(opts: UserOptions) {
  validateRecord(opts.recordMode);
  validateFallbackMode(opts.fallbackMode);
}

export function prepareOptions(userOpts: UserOptions) {
  validateOptions(userOpts);

  const opts = {
    ...defaultOptions,
    name: userOpts.proxyUrl,
    logger: new Logger({ ...defaultOptions, ...userOpts }),
    ...userOpts,
  };

  return opts;
}