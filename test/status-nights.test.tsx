import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('status board nights', () => {
  it('links each readable night and shows counts of its valid events', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-status-nights-'));
    try {
      writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
      writeFileSync(join(runsDir, '2026-10-29.jsonl'), [
        JSON.stringify({ at: '2026-10-29T08:00:00+01:00', job: 'one', status: 'ok', owner: null }),
        'not valid JSON',
      ].join('\n'));
      writeFileSync(join(runsDir, '2026-10-28.jsonl'), [
        JSON.stringify({ at: '2026-10-28T08:00:00+01:00', job: 'one', status: 'retry', owner: 'ada' }),
        JSON.stringify({ at: '2026-10-28T08:01:00+01:00', job: 'one', status: 'fail', owner: 'ada' }),
        JSON.stringify({ at: '2026-10-28T08:02:00+01:00', job: 'two', status: 'ok', owner: null }),
      ].join('\n'));

      const response = await createApp({
        adapter: 'shim',
        installed: '2026-10-29T14:06:00+01:00',
        beatEverySeconds: 60,
        runsDir,
      }).request('/');
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html).toContain('href="/digest/2026-10-30"');
      expect(html).toContain('2026-10-30</a> · ok 0 · retry 0 · fail 0');
      expect(html).toContain('href="/digest/2026-10-29"');
      expect(html).toContain('2026-10-29</a> · ok 1 · retry 0 · fail 0');
      expect(html).toContain('href="/digest/2026-10-28"');
      expect(html).toContain('2026-10-28</a> · ok 1 · retry 1 · fail 1');
      expect(html.indexOf('/digest/2026-10-30')).toBeLessThan(html.indexOf('/digest/2026-10-29'));
    } finally {
      rmSync(runsDir, { recursive: true, force: true });
    }
  });
});
