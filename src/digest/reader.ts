import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isNight(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('at' in value) || typeof value.at !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value.at)
    || !isNight(value.at.slice(0, 10)) || !Number.isFinite(Date.parse(value.at))) return null;
  if (!('job' in value) || typeof value.job !== 'string' || !value.job.trim()) return null;
  if (!('status' in value)
    || (value.status !== 'ok' && value.status !== 'retry' && value.status !== 'fail')) return null;
  if (!('owner' in value) || (value.owner !== null && typeof value.owner !== 'string')) return null;
  const error = 'error' in value ? value.error : undefined;
  if (error !== undefined && typeof error !== 'string') return null;
  return {
    at: value.at,
    job: value.job,
    status: value.status,
    owner: value.owner,
    error,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isNight(night)) return null;
  let contents: string;
  try {
    contents = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }

  const digest: NightDigest = { night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } };
  const jobs = new Map<string, { row: DigestRow; first: number; last: number; errorAt: number }>();
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = parseEvent(line);
    if (!event) {
      digest.badLines += 1;
      continue;
    }
    digest.counts[event.status] += 1;
    const at = Date.parse(event.at);
    const existing = jobs.get(event.job);
    if (!existing) {
      jobs.set(event.job, {
        row: {
          job: event.job, owner: event.owner, runs: 1,
          retries: event.status === 'retry' ? 1 : 0,
          lastStatus: event.status, lastError: event.error ?? null,
          firstAt: event.at, lastAt: event.at, hasFailure: event.status === 'fail',
        },
        first: at, last: at, errorAt: event.error === undefined ? -Infinity : at,
      });
      continue;
    }
    const { row } = existing;
    row.runs += 1;
    if (event.status === 'retry') row.retries += 1;
    if (event.status === 'fail') row.hasFailure = true;
    if (at < existing.first) {
      row.firstAt = event.at;
      existing.first = at;
    }
    if (at >= existing.last) {
      row.lastAt = event.at;
      row.lastStatus = event.status;
      row.owner = event.owner;
      existing.last = at;
    }
    if (event.error !== undefined && at >= existing.errorAt) {
      row.lastError = event.error;
      existing.errorAt = at;
    }
  }
  digest.rows = [...jobs.values()].map(({ row }) => row).sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
