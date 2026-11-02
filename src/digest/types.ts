export type RunStatus = 'ok' | 'retry' | 'fail';

export type DigestRow = {
  job: string;
  /** Owner of the latest event; null is meaningful missing data. */
  owner: string | null;
  /** Number of valid events for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent error by event time, retained after later successes. */
  lastError: string | null;
  /** Original timestamps, including their logged offsets. */
  firstAt: string;
  lastAt: string;
  /** True if any event failed, even if a later event recovered. */
  hasFailure: boolean;
};

export type NightDigest = {
  night: string;
  /** One row per job, sorted lexically by job. */
  rows: DigestRow[];
  badLines: number;
  /** Counts of all valid events, not just each job's final status. */
  counts: Record<RunStatus, number>;
};

/**
 * Implemented by readNight in ./reader.ts. Missing files and invalid YYYY-MM-DD
 * night names return null. Empty files return an empty digest. Malformed JSON or
 * invalid records count as bad lines; blank lines are ignored. Event times set
 * chronology, with the later file entry winning ties. Other I/O errors propagate.
 */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
