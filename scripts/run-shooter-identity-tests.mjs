import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

execSync('rm -rf .shooter-identity-test-build && npx tsc lib/profile.ts lib/scoreSheets/shooterIdentity.ts lib/scoreSheets/drafts.ts lib/scoreSheets/kind.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .shooter-identity-test-build --skipLibCheck', {stdio:'inherit'});
const identity = await import('../.shooter-identity-test-build/scoreSheets/shooterIdentity.js');
const profile = await import('../.shooter-identity-test-build/profile.js');
const drafts = await import('../.shooter-identity-test-build/scoreSheets/drafts.js');

assert.equal(profile.emptyShooterProfileForm().shooterDirectoryVisible, false);
assert.equal(profile.shooterProfileDisplayName({first_name:'Ada',last_name:'Lovelace',shooter_name:'Legacy'}),'Ada Lovelace');
assert.equal(profile.shooterProfileDisplayName({first_name:'Ada',last_name:null,shooter_name:'Legacy Name'}),'Legacy Name');
assert.equal(identity.canSearchShooterDirectory(''), false);
assert.equal(identity.canSearchShooterDirectory(' a '), false);
assert.equal(identity.canSearchShooterDirectory('ab'), true);
assert.equal(identity.normalizeShooterDirectoryQuery('  %%  '), '%%');
assert.equal(identity.capShooterDirectoryLimit(99), 10);
const base={name:'Guest Name',linkedUserId:null,scores:[0]};
const selected=identity.applyShooterIdentity(base,{userId:'user-1',displayName:'Ada Lovelace',country:'United Kingdom'});
assert.equal(selected.linkedUserId,'user-1'); assert.equal(selected.name,'Ada Lovelace');
assert.equal({...selected,name:'Event Ada'}.linkedUserId,'user-1');
const unlinked=identity.unlinkShooterIdentity({...selected,name:'Event Ada'});
assert.equal(unlinked.linkedUserId,null); assert.equal(unlinked.name,'Event Ada');
assert.equal(identity.applyShooterIdentity(selected,{userId:'user-2',displayName:'Grace Hopper',country:'United States'}).linkedUserId,'user-2');
const own=identity.ownProfileSuggestion({user_id:'me',first_name:'Private',last_name:'Shooter',shooter_name:null,country:'NO',my_disciplines:[],shooter_directory_visible:false});
assert.equal(own?.isOwnProfile,true); assert.equal(identity.mergeOwnProfileSuggestion('priv',own,[])[0]?.userId,'me');
assert.equal(identity.identityAlreadyLinked('user-1',[{linkedUserId:'user-1'}]),true);
assert.equal(identity.identityAlreadyLinked('user-1',[{linkedUserId:null}]),false);
assert.equal(identity.normalizeLinkedUserId(undefined),null);
assert.equal(drafts.scoreSheetDraftKey('training','same'),'training_score_sheet_draft:same');
assert.equal(drafts.scoreSheetDraftKey('competition','same'),'score_sheet_draft:competition:same');

const editor=readFileSync('app/components/scoreSheets/ScoreSheetEditor.tsx','utf8');
const picker=readFileSync('app/components/scoreSheets/ShooterIdentityPicker.tsx','utf8');
const migration=readFileSync('supabase/migrations/20260809180000_shooter_directory_identity.sql','utf8');
const csv=readFileSync('lib/scoreSheets/resultCsv.ts','utf8');
assert.match(editor,/ShooterIdentityPicker/); assert.match(editor,/linked_user_id: shooter\.linkedUserId/);
assert.match(editor,/linkedUserId: normalizeLinkedUserId\(shooter\.linked_user_id\)/);
assert.match(picker,/search_shooter_directory/); assert.match(picker,/Change link/); assert.match(picker,/Unlink/);
assert.match(picker,/disabled=\{props\.disabled\}/); assert.doesNotMatch(picker,/email|phone/i);
assert.match(migration,/default false/); assert.match(migration,/security definer/); assert.match(migration,/strpos/);
assert.match(migration,/revoke all .* from public, anon/); assert.match(migration,/limit capped_limit/);
assert.doesNotMatch(csv,/linked_user_id/);
assert.equal(existsSync('app/shooters/page.tsx'),false); assert.equal(existsSync('app/profiles/[id]/page.tsx'),false);
assert.doesNotMatch(editor,/from\("sessions"\)/); assert.doesNotMatch(editor,/Claim result|Add to my Results/);

execSync('rm -rf .shooter-identity-test-build');
console.log('shooter identity tests passed');
