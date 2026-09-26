 "use strict";

const fs = require("node:fs");
const path = require("node:path");

const PROFILE_SCHEMA_VERSION = "astera.evaluation-profile.v2";
const PROFILE_DIR = path.join(__dirname, "..", "profiles-v2");

function fail(message, code = "INVALID_EVALUATION_PROFILE") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertPercent(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 100) fail(`${label} must be between 0 and 100`);
}

function assertWeightTotal(items, label) {
  const total = items.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  if (Math.abs(total - 100) > 1e-9) fail(`${label} weights must total 100`);
}

function validateProfile(profile, source = "profile") {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) fail(`${source} must be an object`);
  if (profile.profile_schema_version !== PROFILE_SCHEMA_VERSION) fail(`${source}.profile_schema_version must be ${PROFILE_SCHEMA_VERSION}`);
  if (!profile.profile_id || typeof profile.profile_id !== "string") fail(`${source}.profile_id is required`);
  if (!Array.isArray(profile.dimensions) || profile.dimensions.length === 0) fail(`${source}.dimensions must be non-empty`);
  assertWeightTotal(profile.dimensions, `${source}.dimensions`);

  const metricIds = new Set();
  const dimensionIds = new Set();
  for (const dimension of profile.dimensions) {
    if (!dimension.dimension_id || dimensionIds.has(dimension.dimension_id)) fail(`${source} has invalid/duplicate dimension_id`);
    dimensionIds.add(dimension.dimension_id);
    if (!hasOwn(dimension, "minimum_score")) fail(`${source}.${dimension.dimension_id}.minimum_score is required`);
    assertPercent(Number(dimension.minimum_score), `${source}.${dimension.dimension_id}.minimum_score`);
    if (!Array.isArray(dimension.metrics) || dimension.metrics.length === 0) fail(`${source}.${dimension.dimension_id}.metrics must be non-empty`);
    assertWeightTotal(dimension.metrics, `${source}.${dimension.dimension_id}.metrics`);
    for (const metric of dimension.metrics) {
      if (!metric.metric_id || metricIds.has(metric.metric_id)) fail(`${source} has invalid/duplicate metric_id`);
      metricIds.add(metric.metric_id);
      if (!["HIGHER_BETTER", "LOWER_BETTER", "BOOLEAN_PASS"].includes(metric.direction)) fail(`${metric.metric_id}.direction is unsupported`);
      if (metric.direction !== "BOOLEAN_PASS" && !Number.isFinite(Number(metric.target))) fail(`${metric.metric_id}.target must be finite`);
      if (metric.floor !== undefined && !Number.isFinite(Number(metric.floor))) fail(`${metric.metric_id}.floor must be finite`);
      if (metric.ceiling !== undefined && !Number.isFinite(Number(metric.ceiling))) fail(`${metric.metric_id}.ceiling must be finite`);
    }
  }

  const hardBlocks = Array.isArray(profile.hard_blocks) ? profile.hard_blocks : [];
  const blockIds = new Set();
  for (const rule of hardBlocks) {
    if (!rule.block_id || blockIds.has(rule.block_id)) fail(`${source} has invalid/duplicate block_id`);
    blockIds.add(rule.block_id);
    if (!rule.metric_id) fail(`${rule.block_id}.metric_id is required`);
    if (!["GT", "GTE", "LT", "LTE", "EQ", "NE", "TRUE", "FALSE"].includes(rule.operator)) fail(`${rule.block_id}.operator is unsupported`);
  }

  if (!profile.judgment || typeof profile.judgment !== "object" || Array.isArray(profile.judgment)) fail(`${source}.judgment is required`);
  if (!hasOwn(profile.judgment, "minimum_total_score")) fail(`${source}.judgment.minimum_total_score is required`);
  assertPercent(Number(profile.judgment.minimum_total_score), `${source}.judgment.minimum_total_score`);
  return profile;
}

function loadProfiles() {
  const result = new Map();
  const names = fs.readdirSync(PROFILE_DIR).filter((name) => name.endsWith(".json")).sort();
  for (const name of names) {
    const full = path.join(PROFILE_DIR, name);
    const profile = validateProfile(JSON.parse(fs.readFileSync(full, "utf8")), name);
    if (result.has(profile.profile_id)) fail(`duplicate profile_id: ${profile.profile_id}`);
    result.set(profile.profile_id, profile);
  }
  return result;
}

function loadProfile(profileId) {
  const id = String(profileId || "").trim();
  if (!id) fail("profile_id is required", "PROFILE_ID_REQUIRED");
  const profiles = loadProfiles();
  if (!profiles.has(id)) fail(`unknown profile_id: ${id}`, "PROFILE_NOT_FOUND");
  return profiles.get(id);
}

module.exports = { PROFILE_SCHEMA_VERSION, validateProfile, loadProfiles, loadProfile };
