import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const tempDirs: string[] = [];

function makeRunsDir(): string {
  const runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  tempDirs.push(runsDir);
  return runsDir;
}

afterEach(() => {
  for (const runsDir of tempDirs.splice(0)) {
    rmSync(runsDir, { recursive: true, force: true });
  }
});

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest routes', () => {
  it('renders sorted rows and returns the same complete digest as JSON', async () => {
    const runsDir = makeRunsDir();
    const night = '2026-10-30';
    const events = [
      { at: '2026-10-30T10:02:00+03:00', job: 'z-last', status: 'ok', owner: null },
      { at: '2026-10-30T09:00:00+03:00', job: 'a<&job', status: 'fail', owner: 'owner<&', error: 'bad <script>&' },
      { at: '2026-10-30T09:01:00+03:00', job: 'a<&job', status: 'retry', owner: 'owner<&' },
      'not valid JSON',
      { at: '2026-10-30T09:02:00+03:00', job: 'a<&job', status: 'retry', owner: 'owner<&' },
      { at: '2026-10-30T09:03:00+03:00', job: 'a<&job', status: 'retry', owner: 'owner<&' },
      { at: '2026-10-30T09:04:00+03:00', job: 'a<&job', status: 'ok', owner: 'owner<&' },
      { at: '2026-10-30T08:00:00+03:00', job: 'b-recovered', status: 'fail', owner: 'bea', error: 'temporary outage' },
      { at: '2026-10-30T08:01:00+03:00', job: 'b-recovered', status: 'ok', owner: 'bea' },
    ];
    writeFileSync(join(runsDir, `${night}.jsonl`), events.map((event) =>
      typeof event === 'string' ? event : JSON.stringify(event),
    ).join('\n'));

    const app = appFor(runsDir);
    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);
    const html = await htmlResponse.text();
    const digest = await jsonResponse.json();

    expect(htmlResponse.status).toBe(200);
    expect(htmlResponse.headers.get('content-type')).toContain('text/html');
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(digest).toEqual({
      night,
      badLines: 1,
      counts: { ok: 3, retry: 3, fail: 2 },
      rows: [
        {
          job: 'a<&job', owner: 'owner<&', runs: 5, retries: 3,
          lastStatus: 'ok', lastError: 'bad <script>&',
          firstAt: '2026-10-30T09:00:00+03:00', lastAt: '2026-10-30T09:04:00+03:00',
          hasFailure: true,
        },
        {
          job: 'b-recovered', owner: 'bea', runs: 2, retries: 0,
          lastStatus: 'ok', lastError: 'temporary outage',
          firstAt: '2026-10-30T08:00:00+03:00', lastAt: '2026-10-30T08:01:00+03:00',
          hasFailure: true,
        },
        {
          job: 'z-last', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null,
          firstAt: '2026-10-30T10:02:00+03:00', lastAt: '2026-10-30T10:02:00+03:00',
          hasFailure: false,
        },
      ],
    });

    const escapedJob = html.indexOf('a&lt;&amp;job');
    const recoveredJob = html.indexOf('b-recovered');
    const secondJob = html.indexOf('z-last');
    expect(escapedJob).toBeGreaterThan(-1);
    expect(recoveredJob).toBeGreaterThan(escapedJob);
    expect(secondJob).toBeGreaterThan(recoveredJob);
    expect(html).toContain('bad lines: 1');
    expect(html.match(/<tr class="warn">/g)).toHaveLength(2);
    expect(html).toContain('owner&lt;&amp;');
    expect(html).toContain('bad &lt;script&gt;&amp;');
    expect(html).toContain('—');
    expect(html).toContain('2026-10-30T09:00:00+03:00');
    expect(html).toContain('2026-10-30T09:04:00+03:00');
    expect(html).not.toContain('<script>');
  });

  it('returns 404 for missing nights and rejects invalid night paths safely', async () => {
    const app = appFor(makeRunsDir());

    for (const path of [
      '/digest/2026-10-30',
      '/api/digest/2026-10-30',
      '/digest/2026-02-30',
      '/api/digest/2026-02-30',
      '/digest/%2e%2e%2fetc%2fpasswd',
      '/api/digest/%2e%2e%2fetc%2fpasswd',
    ]) {
      const response = await app.request(path);
      expect(response.status, path).toBe(404);
    }
  });

  it('renders an empty night in HTML and returns its empty digest in JSON', async () => {
    const runsDir = makeRunsDir();
    const night = '2026-10-31';
    writeFileSync(join(runsDir, `${night}.jsonl`), '');
    const app = appFor(runsDir);

    const [htmlResponse, jsonResponse] = await Promise.all([
      app.request(`/digest/${night}`),
      app.request(`/api/digest/${night}`),
    ]);

    expect(htmlResponse.status).toBe(200);
    expect(await htmlResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
