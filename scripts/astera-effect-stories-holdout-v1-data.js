'use strict';

const { buildStories: buildV1 } = require('./astera-effect-stories-v1-data');
const { buildStories: buildUnseen } = require('./astera-effect-stories-unseen-v1-data');

/** Fixed holdout IDs — story bodies come from frozen v1/unseen builders only. */
const V1_HOLDOUT_IDS = Object.freeze([
  'EF-001', 'EF-004', 'EF-007', 'EF-010', 'EF-013', 'EF-016', 'EF-019', 'EF-022',
  'EF-025', 'EF-028', 'EF-031', 'EF-034', 'EF-037', 'EF-040', 'EF-043', 'EF-046',
  'EF-049', 'EF-052', 'EF-055', 'EF-058', 'EF-061', 'EF-064', 'EF-067', 'EF-070',
  'EF-073', 'EF-076', 'EF-079', 'EF-082', 'EF-085', 'EF-088'
]);

const UNSEEN_HOLDOUT_IDS = Object.freeze([
  'US-001', 'US-004', 'US-007', 'US-010', 'US-013', 'US-016', 'US-019', 'US-022'
]);

function buildStories() {
  const v1Map = new Map(buildV1().map((s) => [s.story_id, s]));
  const unseenMap = new Map(buildUnseen().map((s) => [s.story_id, s]));
  const stories = [];
  for (const id of V1_HOLDOUT_IDS) {
    const story = v1Map.get(id);
    if (!story) throw new Error(`Missing holdout v1 story ${id}`);
    stories.push({ ...story, holdout_source: 'v1' });
  }
  for (const id of UNSEEN_HOLDOUT_IDS) {
    const story = unseenMap.get(id);
    if (!story) throw new Error(`Missing holdout unseen story ${id}`);
    stories.push({ ...story, holdout_source: 'unseen' });
  }
  return stories;
}

module.exports = { buildStories, V1_HOLDOUT_IDS, UNSEEN_HOLDOUT_IDS };
