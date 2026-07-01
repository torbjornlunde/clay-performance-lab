import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: (id) => {
      if (mocks[id]) return mocks[id];
      throw new Error(`Unexpected require ${id} from ${file}`);
    },
  };
  vm.runInNewContext(js, context, { filename: file });
  return context.module.exports;
}

const postTargets = loadTs('lib/targets/postTargets.ts');
const setup = loadTs('lib/targets/postSetupState.ts', { './postTargets': postTargets });

const migrated = postTargets.migrateDraft({
  schemaVersion: 1,
  sessionId: 's1',
  postCount: 4,
  targetsPerPost: 8,
  defaultPostFormat: '10 singles',
  posts: [{ post_number: 1, instructions: 'limit A', source_text: '', presentations: [] }],
  lastLocalUpdateAt: '1970-01-01T00:00:00.000Z',
  lastServerSyncAt: '1970-01-01T00:00:00.000Z',
  hasUnsyncedChanges: true,
}, 's1');
assert.equal(migrated.postCount, 4, 'draft migration restores post count');
assert.equal(migrated.targetsPerPost, 8, 'draft migration restores targetsPerPost');
assert.equal(migrated.defaultPostFormat, '10 singles', 'draft migration restores defaultPostFormat');
assert.equal(migrated.lastServerSyncAt, undefined, 'draft migration drops epoch sync timestamp');

const legacy = postTargets.migrateDraft({ schemaVersion: 1, sessionId: 's1', posts: [], postCount: 2 }, 's1');
assert.equal(legacy.targetsPerPost, 10, 'older drafts get safe targets-per-post default');
assert.equal(legacy.defaultPostFormat, '5 pairs', 'older drafts get safe format default');

const metadataOnly = setup.planSetupSave({ postCount: 12, targetsPerPost: 7, defaultPostFormat: '5 report pairs', existingTotal: null, confirmConflict: () => true });
assert.equal(metadataOnly.shouldContinue, true, 'metadata-only save can proceed');
assert.equal(JSON.stringify(metadataOnly.metadata), JSON.stringify({ post_count: 12, course_count: 12, targets_per_post: 7, default_post_format: '5 report pairs', total_targets: 84 }), 'metadata-only save writes setup metadata and new setup total');

let confirmCalls = 0;
const cancelled = setup.planSetupSave({ postCount: 10, targetsPerPost: 10, defaultPostFormat: '5 pairs', existingTotal: 90, confirmConflict: () => { confirmCalls += 1; return false; } });
assert.equal(confirmCalls, 1, 'total conflict asks before writes');
assert.equal(cancelled.shouldContinue, false, 'cancelled conflict aborts save plan');
assert.equal(cancelled.metadata.total_targets, undefined, 'cancelled conflict does not plan total overwrite');

const partial = postTargets.normalizePost(1, [{ presentation_number: 1, presentation_type: 'single', targets: [] }], 'instruction');
const complete = postTargets.normalizePost(2, Array.from({ length: 10 }, (_, i) => ({ presentation_number: i + 1, presentation_type: 'single', targets: [] })));
assert.equal(setup.statusForPost({ post: partial, expectedTargets: 10 }), 'Partly set up', 'fewer targets than expected is partial');
assert.equal(setup.statusForPost({ post: complete, expectedTargets: 10 }), 'Set up', 'expected target count is complete');
assert.equal(setup.configuredPostCount([partial, complete], 10), 1, 'progress counts only complete posts');
assert.equal(setup.postNumbersMeetingExpected([{ post_number: 1 }, { post_number: 2 }, { post_number: 2 }], 2), 1, 'overview progress uses same expected target count');

const pendingSaved = { schemaVersion: 1, queueId: 's1:2', sessionId: 's1', postNumber: 2, image: {}, mimeType: 'image/jpeg', createdAt: '', updatedAt: '', status: 'saved_on_device' };
const pendingReview = { ...pendingSaved, queueId: 's1:3', postNumber: 3, status: 'ready_for_review', analysis: { presentations: [], instructions: '', rawText: '', detectedPostNumbers: [], confidence: 'high', warnings: [] } };
assert.equal(setup.statusForPost({ post: postTargets.emptyPosts(3)[1], expectedTargets: 10, pendingPhoto: pendingSaved }), 'Photo saved', 'unselected post with pending photo shows saved');
assert.equal(setup.statusForPost({ post: postTargets.emptyPosts(3)[2], expectedTargets: 10, pendingPhoto: pendingReview }), 'Ready to review', 'unselected post with analysis shows review');
assert.equal(setup.scopedPhotoKey('s1', 3), 's1:3', 'photo keys are session/post scoped');

assert.equal(setup.scoreDisplay(87, undefined), '87', 'explicit own score displays without total');
assert.equal(setup.scoreDisplay(87, 100), '87 / 100', 'score displays with total');
assert.equal(setup.scoreDisplay(null, 100), 'No result yet', 'no result text only when no score exists');

console.log('post setup focused behavior tests passed');
