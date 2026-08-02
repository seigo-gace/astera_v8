'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const MAGIC = Buffer.from('ASTEVS01', 'ascii');
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_ARTIFACT_BYTES = 128 * 1024 * 1024;

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeSegment(value, field) {
  const text = String(value || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,128}$/.test(text)) {
    const error = new Error(`${field} contains unsafe path characters`);
    error.code = 'EVIDENCE_SPOOL_PATH_INVALID';
    throw error;
  }
  return text;
}

function normalizeKey(value) {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(String(value || '').trim(), 'utf8');
  if (raw.length === 32) return Buffer.from(raw);
  const text = raw.toString('utf8').trim();
  if (/^[a-f0-9]{64}$/i.test(text)) return Buffer.from(text, 'hex');
  try {
    const decoded = Buffer.from(text, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {}
  const error = new Error('evidence spool encryption key must be exactly 32 bytes, 64 hex characters, or base64-encoded 32 bytes');
  error.code = 'EVIDENCE_SPOOL_KEY_INVALID';
  throw error;
}

function loadKey(options = {}) {
  if (options.key) return normalizeKey(options.key);
  const file = options.keyFile || process.env.ASTERA_EVIDENCE_SPOOL_KEY_FILE;
  if (!file) {
    const error = new Error('ASTERA_EVIDENCE_SPOOL_KEY_FILE is required');
    error.code = 'EVIDENCE_SPOOL_KEY_REQUIRED';
    throw error;
  }
  return normalizeKey(fs.readFileSync(file));
}

function fsyncDirectory(directory) {
  const descriptor = fs.openSync(directory, 'r');
  try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
}

function tenantDirectoryName(tenantId) {
  return crypto.createHash('sha256').update(String(tenantId)).digest('hex').slice(0, 32);
}

class DurableEvidenceSpool {
  constructor(options = {}) {
    this.root = path.resolve(
      options.root
      || process.env.ASTERA_EVIDENCE_DURABLE_SPOOL
      || '/data/evidence-jobs'
    );
    this.key = loadKey(options);
    this.maximumArtifactBytes = Math.max(
      1024,
      Math.min(MAX_ARTIFACT_BYTES, Number(options.maximumArtifactBytes || MAX_ARTIFACT_BYTES))
    );
    fs.mkdirSync(this.root, { recursive: true, mode: 0o700 });
    fs.chmodSync(this.root, 0o700);
  }

  jobDirectory(tenantId, jobId) {
    const tenantHash = tenantDirectoryName(tenantId);
    const job = safeSegment(jobId, 'jobId');
    return path.join(this.root, tenantHash, job);
  }

  artifactPath(tenantId, jobId, stage) {
    const safeStage = safeSegment(stage.toLowerCase().replace(/_/g, '-'), 'stage');
    return path.join(this.jobDirectory(tenantId, jobId), `${safeStage}.json.gz.enc`);
  }

  write({ tenantId, jobId, stage, schemaVersion, value }) {
    const directory = this.jobDirectory(tenantId, jobId);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fs.chmodSync(directory, 0o700);

    const plaintext = Buffer.from(stableStringify({
      schema_version: schemaVersion,
      job_id: jobId,
      stage,
      value
    }), 'utf8');
    if (plaintext.length > this.maximumArtifactBytes) {
      const error = new Error('evidence checkpoint exceeds maximum artifact bytes');
      error.code = 'EVIDENCE_SPOOL_ARTIFACT_TOO_LARGE';
      throw error;
    }

    const compressed = zlib.gzipSync(plaintext, { level: 6 });
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`${jobId}:${stage}:${schemaVersion}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = Buffer.concat([MAGIC, iv, tag, ciphertext]);

    const finalPath = this.artifactPath(tenantId, jobId, stage);
    const temporaryPath = `${finalPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, envelope);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    fs.renameSync(temporaryPath, finalPath);
    fsyncDirectory(directory);

    return Object.freeze({
      job_id: jobId,
      stage,
      file_path: finalPath,
      ciphertext_sha256: sha256(envelope),
      plaintext_sha256: sha256(plaintext),
      schema_version: schemaVersion,
      size_bytes: envelope.length,
      created_at: new Date().toISOString()
    });
  }

  read(record) {
    const filePath = path.resolve(record.file_path);
    const relative = path.relative(this.root, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      const error = new Error('artifact path escapes evidence spool root');
      error.code = 'EVIDENCE_SPOOL_PATH_INVALID';
      throw error;
    }

    const envelope = fs.readFileSync(filePath);
    if (sha256(envelope) !== record.ciphertext_sha256) {
      const error = new Error('evidence checkpoint ciphertext hash mismatch');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      throw error;
    }
    if (envelope.length < MAGIC.length + IV_BYTES + TAG_BYTES || !envelope.subarray(0, MAGIC.length).equals(MAGIC)) {
      const error = new Error('evidence checkpoint envelope is invalid');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      throw error;
    }

    const ivStart = MAGIC.length;
    const tagStart = ivStart + IV_BYTES;
    const ciphertextStart = tagStart + TAG_BYTES;
    const iv = envelope.subarray(ivStart, tagStart);
    const tag = envelope.subarray(tagStart, ciphertextStart);
    const ciphertext = envelope.subarray(ciphertextStart);

    let plaintext;
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from(
        `${record.job_id}:${record.stage}:${record.schema_version}`,
        'utf8'
      ));
      decipher.setAuthTag(tag);
      const compressed = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);
      plaintext = zlib.gunzipSync(compressed, {
        maxOutputLength: this.maximumArtifactBytes
      });
    } catch (cause) {
      const error = new Error('evidence checkpoint could not be authenticated or decompressed');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      error.cause = cause;
      throw error;
    }

    if (sha256(plaintext) !== record.plaintext_sha256) {
      const error = new Error('evidence checkpoint plaintext hash mismatch');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      throw error;
    }

    let parsed;
    try {
      parsed = JSON.parse(plaintext.toString('utf8'));
    } catch (cause) {
      const error = new Error('evidence checkpoint JSON is invalid');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      error.cause = cause;
      throw error;
    }
    if (
      parsed.schema_version !== record.schema_version
      || parsed.job_id !== record.job_id
      || parsed.stage !== record.stage
    ) {
      const error = new Error('evidence checkpoint identity does not match artifact record');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      throw error;
    }
    return Object.freeze(parsed);
  }

  remove(record) {
    try {
      fs.unlinkSync(record.file_path);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  removeJob(tenantId, jobId) {
    const directory = this.jobDirectory(tenantId, jobId);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = {
  DurableEvidenceSpool,
  MAX_ARTIFACT_BYTES,
  loadKey,
  normalizeKey,
  tenantDirectoryName
};
