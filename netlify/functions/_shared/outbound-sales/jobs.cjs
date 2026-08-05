'use strict';

const { redactSecretText, sanitizeForAudit } = require('./security.cjs');

const JOB_TYPES = Object.freeze([
  'discover',
  'normalize',
  'research',
  'verify_email',
  'qualify',
  'generate',
  'schedule',
  'send',
  'process_email_event',
  'classify_reply',
  'attribute_order',
  'aggregate_metrics',
]);

function validateJobType(jobType) {
  if (!JOB_TYPES.includes(jobType)) throw new TypeError(`Unsupported outbound job type: ${jobType}`);
  return jobType;
}

function retryDelaySeconds(attemptCount, random = Math.random) {
  const attempt = Math.max(1, Math.min(10, Number(attemptCount) || 1));
  const base = Math.min(6 * 60 * 60, 30 * (2 ** (attempt - 1)));
  return Math.round(base * (0.8 + (Math.max(0, Math.min(1, random())) * 0.4)));
}

function safeJobErrorMessage(error) {
  return redactSecretText(error?.message || error || 'Outbound job failed.').slice(0, 1000);
}

async function enqueueJob(sql, job) {
  validateJobType(job.jobType);
  const rows = await sql(
    `INSERT INTO outbound_jobs (
       job_type, payload, dedupe_key, priority, run_after, max_attempts
     )
     VALUES ($1, $2::jsonb, $3, $4, COALESCE($5::timestamptz, NOW()), $6)
     ON CONFLICT DO NOTHING
     RETURNING id, job_type, status, run_after, attempt_count, max_attempts`,
    [
      job.jobType,
      JSON.stringify(sanitizeForAudit(job.payload || {})),
      job.dedupeKey || null,
      Number.isInteger(job.priority) ? job.priority : 0,
      job.runAfter || null,
      Number.isInteger(job.maxAttempts) ? Math.max(1, Math.min(20, job.maxAttempts)) : 5,
    ],
  );
  return rows[0] || null;
}

async function claimJobs(sql, { workerId, jobTypes, limit = 10, leaseSeconds = 300 }) {
  const types = (jobTypes || JOB_TYPES).map(validateJobType);
  const safeLimit = Math.max(1, Math.min(30, Number(limit) || 10));
  const safeLease = Math.max(30, Math.min(900, Number(leaseSeconds) || 300));
  return sql(
    `WITH candidates AS (
       SELECT id
         FROM outbound_jobs
        WHERE status IN ('queued', 'retry')
          AND run_after <= NOW()
          AND job_type = ANY($2::text[])
        ORDER BY priority DESC, run_after, created_at
        FOR UPDATE SKIP LOCKED
        LIMIT $3
     )
     UPDATE outbound_jobs AS jobs
        SET status = 'running',
            lease_owner = $1,
            lease_expires_at = NOW() + make_interval(secs => $4),
            attempt_count = jobs.attempt_count + 1,
            updated_at = NOW()
       FROM candidates
      WHERE jobs.id = candidates.id
     RETURNING jobs.*`,
    [workerId, types, safeLimit, safeLease],
  );
}

async function completeJob(sql, { jobId, workerId }) {
  const rows = await sql(
    `UPDATE outbound_jobs
        SET status = 'succeeded', completed_at = NOW(), lease_owner = NULL,
            lease_expires_at = NULL, last_error_code = NULL,
            last_error_message = NULL, updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
     RETURNING id, status, completed_at`,
    [jobId, workerId],
  );
  return rows[0] || null;
}

async function failJob(sql, { jobId, workerId, attemptCount, error, random = Math.random }) {
  const delaySeconds = retryDelaySeconds(attemptCount, random);
  const rows = await sql(
    `UPDATE outbound_jobs
        SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead' ELSE 'retry' END,
            run_after = CASE WHEN attempt_count >= max_attempts THEN run_after
                             ELSE NOW() + make_interval(secs => $3) END,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = $4,
            last_error_message = $5,
            completed_at = CASE WHEN attempt_count >= max_attempts THEN NOW() ELSE NULL END,
            updated_at = NOW()
      WHERE id = $1 AND status = 'running' AND lease_owner = $2
     RETURNING id, status, run_after, attempt_count, max_attempts`,
    [
      jobId,
      workerId,
      delaySeconds,
      redactSecretText(error?.code || 'JOB_FAILED').slice(0, 100),
      safeJobErrorMessage(error),
    ],
  );
  return rows[0] || null;
}

async function releaseExpiredLeases(sql) {
  return sql(
    `UPDATE outbound_jobs
        SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead' ELSE 'retry' END,
            run_after = CASE WHEN attempt_count >= max_attempts THEN run_after ELSE NOW() END,
            lease_owner = NULL,
            lease_expires_at = NULL,
            last_error_code = 'LEASE_EXPIRED',
            last_error_message = 'Worker lease expired before completion.',
            completed_at = CASE WHEN attempt_count >= max_attempts THEN NOW() ELSE NULL END,
            updated_at = NOW()
      WHERE status = 'running' AND lease_expires_at < NOW()
     RETURNING id, status`,
  );
}

module.exports = {
  JOB_TYPES,
  validateJobType,
  retryDelaySeconds,
  safeJobErrorMessage,
  enqueueJob,
  claimJobs,
  completeJob,
  failJob,
  releaseExpiredLeases,
};
