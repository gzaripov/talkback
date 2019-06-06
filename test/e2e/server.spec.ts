import fs from 'fs';
import https from 'https';
import Logger from '../../src/logger';
import { TapeJson } from '../../src/tape';
import { Context, Options } from '../../src/context';
import { apiUrl } from './api-server';
import {
  withFlyback,
  flybackFetch,
  flybackUrl,
  tapesPath,
  readJSONFromFile,
} from './flyback-server';

describe('flyback', () => {
  describe('record mode NEW', () => {
    it('proxies and creates a new tape when the POST request is unknown with human readable req and res', async () => {
      const reqBody = { foo: 'bar' };
      const headers = { 'content-type': 'application/json' };
      const url = '/test/1';

      const response = await flybackFetch(url, {
        compress: false,
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      });

      expect(response.status).toEqual(200);

      const expectedResBody = { ok: true, body: { foo: 'bar' } };
      const body = await response.json();
      const tape = readJSONFromFile(tapesPath, url);

      expect(body).toEqual(expectedResBody);
      expect(tape.request.path).toEqual('/test/1');
      expect(tape.request.body).toEqual(reqBody);
      expect(tape.response.body).toEqual(expectedResBody);
    });

    it('proxies and creates a new tape when the GET request is unknown', async () => {
      const url = '/test/1';
      const res = await flybackFetch(url, { compress: false, method: 'GET' });

      expect(res.status).toEqual(200);

      const expectedResBody = { ok: true, body: null };
      const body = await res.json();

      expect(body).toEqual(expectedResBody);

      const tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual('/test/1');
      expect(tape.response.body).toEqual(expectedResBody);
    });

    it('proxies and creates a new tape when the POST request is unknown with human readable req and res', async () => {
      const reqBody = JSON.stringify({ foo: 'bar' });
      const headers = { 'content-type': 'application/json' };
      const url = `test/1`;
      const res = await flybackFetch(url, {
        compress: false,
        method: 'POST',
        headers,
        body: reqBody,
      });

      expect(res.status).toEqual(200);

      const expectedResBody = { ok: true, body: { foo: 'bar' } };
      const body = await res.json();

      expect(body).toEqual(expectedResBody);

      const tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual('/test/1');
      expect(tape.response.body).toEqual(expectedResBody);
    });

    it('proxies and creates a new tape when the HEAD request is unknown', async () => {
      const headers = { 'content-type': 'application/json' };
      const url = 'test/head';
      const res = await flybackFetch(url, { method: 'HEAD', headers });

      expect(res.status).toEqual(200);

      const tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual('/test/head');
      expect(tape.request.body).toEqual('');
      expect(tape.response.body).toEqual('');
    });

    it('proxies and creates a new tape with a custom tape name generator', async () => {
      const url = `/test/1`;
      const res = await flybackFetch(url, { compress: false, method: 'GET' });

      expect(res.status).toEqual(200);

      const tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual(url);
    });

    it('decorates proxied responses', async () => {
      const tapeDecorator = (tape: TapeJson) => {
        const location = tape.response.headers['location'];

        if (typeof location === 'string') {
          tape.response.headers['location'] = [location.replace(apiUrl, flybackUrl)];
        }

        return tape;
      };

      const response = await flybackFetch(
        '/test/redirect/1',
        {
          method: 'GET',
          redirect: 'manual',
        },
        { tapeDecorator },
      );

      expect(response.status).toEqual(302);

      const location = response.headers.get('location');

      expect(location).toEqual(`${flybackUrl}/test/1`);
    });

    it('handles when the proxied server returns a 500', async () => {
      const path = 'test/3/500';
      const res = await flybackFetch(path);

      expect(res.status).toEqual(500);

      const tape = readJSONFromFile(tapesPath, path);

      expect(tape.request.path).toEqual('/test/3/500');
      expect(tape.response.status).toEqual(500);
    });

    it('loads existing tapes and uses them if they match', async () => {
      const res = await flybackFetch('/test/3', { compress: false }, { recordMode: 'DISABLED' });

      expect(res.status).toEqual(200);

      const body = await res.json();

      expect(body).toEqual({ ok: true });
    });

    it('matches and returns pretty printed tapes', async () => {
      const headers = { 'content-type': 'application/json' };
      const body = JSON.stringify({ param1: 3, param2: { subParam: 1 } });

      const res = await flybackFetch(
        '/test/pretty',
        {
          compress: false,
          method: 'POST',
          headers,
          body,
        },
        {
          recordMode: 'DISABLED',
          ignoreAllHeaders: true,
        },
      );

      expect(res.status).toEqual(200);

      const resClone = res.clone();

      const resBody = await res.json();

      expect(resBody).toEqual({ ok: true, foo: { bar: 3 } });

      const resBodyAsText = await resClone.text();

      expect(JSON.parse(resBodyAsText)).toEqual({ ok: true, foo: { bar: 3 } });
    });

    // TODO
    it.skip('calls provided callback', async () => {
      const counter = { count: 0 };

      // await withFlyback(
      //   { recordMode: 'DISABLED' },
      //   {
      //     callback: () => {
      //       counter.count += 1;
      //     },
      //   },
      // );

      expect(counter.count).toEqual(1);
    });

    it("doesn't match pretty printed tapes with different body", async () => {
      const headers = { 'content-type': 'application/json' };

      const makeRequest = async (body) => {
        const res = await flybackFetch(
          '/test/pretty',
          {
            compress: false,
            method: 'POST',
            headers,
            body,
          },
          { recordMode: 'DISABLED' },
        );

        expect(res.status).toEqual(404);
      };

      // Different nested object
      let body = JSON.stringify({ param1: 3, param2: { subParam: 2 } });

      await makeRequest(body);

      // Different key order
      body = JSON.stringify({ param2: { subParam: 1 }, param1: 3 });
      await makeRequest(body);

      // Extra key
      body = JSON.stringify({ param1: 3, param2: { subParam: 1 }, param3: false });
      await makeRequest(body);
    });

    it('decorates the response of an existing tape', async () => {
      const tapeDecorator = (tapeJson: TapeJson) => {
        if (tapeJson.response.headers['content-type'] === 'application/json') {
          const body = tapeJson.response.body;
          const json = typeof body === 'string' ? JSON.parse(body) : body;

          tapeJson.response.body = { text: `${json.text}__decorated` };
        }

        return tapeJson;
      };

      const headers = { 'content-type': 'application/json' };
      const body = JSON.stringify({ text: 'request-test-text' });
      const res = await flybackFetch(
        '/test/echo',
        {
          compress: false,
          method: 'POST',
          headers,
          body,
        },
        { recordMode: 'DISABLED', tapeDecorator },
      );

      const resBody = await res.json();

      expect(res.status).toEqual(200);
      expect(resBody).toEqual({ text: 'response-test-text__decorated' });
    });
  });

  describe('record mode OVERWRITE', () => {
    it('overwrites an existing tape', async () => {
      const flybackOpts: Partial<Options> = {
        recordMode: 'OVERWRITE',
        ignoreHeaders: ['x-flyback-ping'],
      };

      const url = 'test/1';
      let headers = { 'x-flyback-ping': 'test1' };

      let res = await flybackFetch(url, { compress: false, headers }, flybackOpts);

      expect(res.status).toEqual(200);
      let resBody = await res.json();
      let expectedBody = { ok: true, body: 'test1' };

      expect(resBody).toEqual(expectedBody);

      let tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual('/test/1');
      expect(tape.response.body).toEqual(expectedBody);

      headers = { 'x-flyback-ping': 'test2' };

      res = await flybackFetch(url, { compress: false, headers }, flybackOpts);
      expect(res.status).toEqual(200);
      resBody = await res.json();
      expectedBody = { ok: true, body: 'test2' };
      expect(resBody).toEqual(expectedBody);

      tape = readJSONFromFile(tapesPath, url);

      expect(tape.request.path).toEqual('/test/1');
      expect(tape.response.body).toEqual(expectedBody);
    });
  });

  describe('record mode DISABLED', () => {
    it('returns a 404 on unkwown request with fallbackMode NOT_FOUND (default)', async () => {
      const res = await flybackFetch('/test/1', { compress: false }, { recordMode: 'DISABLED' });

      expect(res.status).toEqual(404);
    });

    it('proxies request to host on unkwown request with fallbackMode PROXY', async () => {
      const reqBody = JSON.stringify({ foo: 'bar' });
      const headers = { 'content-type': 'application/json' };
      const res = await flybackFetch(
        '/test/1',
        {
          compress: false,
          method: 'POST',
          headers,
          body: reqBody,
        },
        {
          recordMode: 'DISABLED',
          fallbackMode: 'PROXY',
        },
      );

      expect(res.status).toEqual(200);

      const expectedResBody = { ok: true, body: { foo: 'bar' } };
      const body = await res.json();

      expect(body).toEqual(expectedResBody);

      expect(fs.existsSync(`${tapesPath}/unnamed-3.json`)).toEqual(false);
    });
  });

  describe('error handling', () => {
    // TODO
    it.skip('returns a 500 if anything goes wrong', async () => {
      const logger = new Logger({} as Context);
      const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
      const error = new Error('Test error');

      const response = await flybackFetch(
        '/test/1',
        { compress: false },
        { recordMode: 'DISABLED', logger },
      );

      expect(loggerSpy).toHaveBeenCalledWith(error);
      expect(response.status).toEqual(500);
    });
  });

  describe('summary printing', () => {
    it('prints the summary when enabled', async () => {
      const logger = new Logger({} as Context);
      const spy = jest.spyOn(console, 'log').mockImplementation(() => 0);

      await withFlyback(() => 0, { summary: true, logger });

      expect(spy).toBeCalledWith(expect.stringContaining('SUMMARY'));
    });

    it("doesn't print the summary when disabled", async () => {
      const logger = new Logger({} as Context);
      const spy = jest.spyOn(logger, 'log').mockImplementation(() => 0);

      await withFlyback(() => 0, { summary: false, logger });

      expect(spy).toBeCalledWith(expect.not.stringContaining('SUMMARY'));
    });
  });

  describe('tape usage information', () => {
    // TODO
    xit('should indicate that a tape has been used after usage', async () => {
      await withFlyback(() => 0, {
        recordMode: 'DISABLED',
        summary: true,
      });

      const res = await flybackFetch('/test/3', { compress: false });

      expect(res.status).toEqual(200);

      const body = await res.json();

      expect(body).toEqual({ ok: true });
    });
  });

  describe('https', () => {
    it('should be able to run a https server', async () => {
      const agent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await flybackFetch(
        '/test/3',
        { agent, compress: false },
        {
          recordMode: 'DISABLED',
          https: {
            keyPath: './test/e2e/cert/localhost.key',
            certPath: './test/e2e/cert/localhost.crt',
          },
        },
      );

      expect(response.status).toEqual(200);
    });
  });
});
