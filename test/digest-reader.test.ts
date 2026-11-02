import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const temporaryDirs: string[] = [];
function fixture(lines: unknown[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  temporaryDirs.push(dir);
  writeFileSync(join(dir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  return dir;
}
afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) rmSync(dir, { recursive: true });
});

describe('night reader', () => {
  it('reads the real night, keeps null owners and recovered retry errors', () => {
    const result = readNight('runs', night);
    expect(result?.badLines).toBe(1);
    expect(result?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result?.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result?.rows[0]).toMatchObject({ owner: null, runs: 1, lastStatus: 'ok' });
    expect(result?.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503', hasFailure: false,
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result?.rows[3]).toMatchObject({ hasFailure: true, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes a missing file from an empty night', () => {
    const dir = fixture();
    expect(readNight(dir, '2026-10-27')).toBeNull();
    expect(readNight(dir, night)).toEqual({ night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
  });

  it('rejects invalid night names and dates before accessing files', () => {
    for (const invalid of ['../2026-10-28', '2026-10-28/other', '2026-1-01', '2026-02-30', '2026-13-01', '']) {
      expect(readNight('/not/a/runs/directory', invalid)).toBeNull();
    }
  });

  it('counts malformed JSON and invalid schemas without losing valid events', () => {
    const valid = { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: null };
    const invalid = [
      null, [], 42, {},
      { ...valid, at: 'not a date' }, { ...valid, at: '2026-02-30T23:00:00+01:00' },
      { ...valid, at: '2026-10-28T23:00:00' },
      { ...valid, job: ' ' }, { ...valid, job: 1 },
      { ...valid, status: 'unknown' }, { ...valid, owner: false },
      { ...valid, owner: undefined }, { ...valid, error: null },
    ];
    const dir = fixture([...invalid, valid]);
    writeFileSync(join(dir, `${night}.jsonl`), '\r\n  \r\n{bad json\n', { flag: 'a' });
    expect(readNight(dir, night)).toMatchObject({ badLines: invalid.length + 1, counts: { ok: 1, retry: 0, fail: 0 } });
    expect(readNight(dir, night)?.rows).toHaveLength(1);
  });

  it('uses event times across offsets, retaining failures and the most recent error', () => {
    const dir = fixture([
      { at: '2026-10-29T02:00:00+02:00', job: 'job', status: 'ok', owner: null },
      { at: '2026-10-29T00:30:00+01:00', job: 'job', status: 'fail', owner: 'new', error: 'new failure' },
      { at: '2026-10-29T00:00:00+01:00', job: 'job', status: 'retry', owner: 'old', error: 'old error' },
    ]);
    expect(readNight(dir, night)?.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1, lastStatus: 'ok',
      lastError: 'new failure', firstAt: '2026-10-29T00:00:00+01:00',
      lastAt: '2026-10-29T02:00:00+02:00', hasFailure: true,
    }]);
  });

  it('uses the later file entry for tied last event and error times', () => {
    const at = '2026-10-29T01:00:00+01:00';
    const dir = fixture([
      { at, job: 'job', status: 'fail', owner: 'old', error: 'first error' },
      { at, job: 'job', status: 'retry', owner: null, error: 'last error' },
      { at, job: 'job', status: 'ok', owner: 'new' },
    ]);
    expect(readNight(dir, night)?.rows[0]).toMatchObject({
      owner: 'new', lastStatus: 'ok', lastError: 'last error', hasFailure: true, runs: 3, retries: 1,
    });
  });

  it('propagates I/O failures other than a missing file', () => {
    const dir = fixture();
    expect(() => readNight(join(dir, `${night}.jsonl`), night)).toThrow();
  });
});
