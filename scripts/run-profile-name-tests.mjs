import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .profile-name-test-build && npx tsc lib/profile.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .profile-name-test-build --skipLibCheck', {stdio:'inherit'});
const profile = await import('../.profile-name-test-build/profile.js');

assert.equal(profile.normalizeProfileWhitespace('  Ada   Lovelace  '), 'Ada Lovelace', 'trims and collapses whitespace');
assert.equal(profile.composeCanonicalShooterName('  Ada ', '  Lovelace  '), 'Ada Lovelace', 'composes canonical first and last name');
assert.equal(profile.composeCanonicalShooterName('Ada', ''), 'Ada', 'composition helper can still compose partial input');
assert.equal(profile.shooterProfileDisplayName({first_name:'  Ada  ', last_name:null, shooter_name:'  Legacy   Shooter  '}), 'Legacy Shooter', 'first name without last name falls back to legacy shooter_name');
assert.equal(profile.shooterProfileDisplayName({first_name:null, last_name:'  Lovelace  ', shooter_name:'  Legacy   Shooter  '}), 'Legacy Shooter', 'last name without first name falls back to legacy shooter_name');
assert.equal(profile.shooterProfileDisplayName({first_name:'  Ada  ', last_name:null, shooter_name:null}), '', 'partial new name without legacy returns empty display name');
assert.equal(profile.shooterProfileDisplayName({first_name:'  Ada ', last_name:' Lovelace ', shooter_name:'Legacy Shooter'}), 'Ada Lovelace', 'canonical name takes display precedence when both new fields exist');
assert.equal(profile.shooterProfileDisplayName({first_name:'  Ada   Marie ', last_name:'  Lovelace   Byron  ', shooter_name:'Legacy Shooter'}), 'Ada Marie Lovelace Byron', 'repeated whitespace remains normalized in display name');
assert.deepEqual(profile.shooterProfileToForm({first_name:'Ada', last_name:null, shooter_name:'  Legacy   Shooter  ', country:'NO', my_disciplines:['Sporting']}).legacyShooterName, 'Legacy Shooter', 'form keeps legacy context while canonical name is incomplete');
assert.deepEqual(profile.shooterProfileToForm({first_name:'  Ada ', last_name:' Lovelace ', shooter_name:'Ada Lovelace', country:'NO', my_disciplines:['Sporting']}).legacyShooterName, '', 'form clears legacy context when canonical fields are complete');
assert.equal(profile.isShooterProfileComplete({first_name:'', last_name:'Lovelace', shooter_name:'Legacy Name', country:'NO', my_disciplines:['Sporting']}), false, 'first name is required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'', shooter_name:'Legacy Name', country:'NO', my_disciplines:['Sporting']}), false, 'last name is required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:null, country:'NO', my_disciplines:['Sporting']}), true, 'complete profile uses first, last, country and discipline');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:'Ada Lovelace', country:'', my_disciplines:['Sporting']}), false, 'country remains required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:'Ada Lovelace', country:'NO', my_disciplines:[]}), false, 'discipline remains required');

execSync('rm -rf .profile-name-test-build');
console.log('profile name tests passed');
