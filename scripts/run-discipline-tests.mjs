import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

execSync('rm -rf .discipline-test-build && npx tsc lib/disciplines.ts lib/targets/postSetupState.ts lib/targets/postTargets.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .discipline-test-build --skipLibCheck', {stdio:'inherit'});
const d = await import('../.discipline-test-build/disciplines.js');
const setup = await import('../.discipline-test-build/targets/postSetupState.js');

assert.equal(d.isPostBasedSportingDiscipline('English Sporting'), true, 'English Sporting routes to the post/stand-based target editor');
assert.equal(d.postTargetUnitLabel('English Sporting'), 'Stand', 'English Sporting uses Stand terminology');
assert.equal(d.postTargetUnitLabel('Leirduesti'), 'Post', 'Leirduesti keeps Post terminology');
assert.equal(setup.scopedPhotoKey('session-a', 3), 'session-a:3', 'image analysis is scoped to the selected stand/post');
assert.notEqual(setup.scopedPhotoKey('session-a', 3), setup.scopedPhotoKey('session-a', 4), 'one stand photo queue cannot overwrite another stand');

const page = readFileSync('app/sessions/[id]/targets/page.tsx', 'utf8');
assert.match(page, /isPostBasedSportingDiscipline\(session\.discipline\)/, 'post-based sporting disciplines use the shared target editor route');
assert.match(page, /<PostTargetEditor/, 'post-based sporting disciplines render PostTargetEditor');
const editor = readFileSync('app/sessions/[id]/targets/PostTargetEditor.tsx', 'utf8');
assert.match(editor, /fetch\(`\/api\/sessions\/\$\{sessionId\}\/post-sign\/analyze`/, 'stand sign upload uses the existing post-sign analysis API');
assert.match(editor, /posts\.map\(\(p, i\) => i === current - 1 \? normalizePost\(current, presentations, review\.instructions, review\.rawText\) : p\)/, 'applying a stand sign only replaces the selected stand');
execSync('rm -rf .discipline-test-build');
console.log('discipline routing and stand photo scoping tests passed');
