import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

execSync('rm -rf .profile-name-test-build && npx tsc lib/profile.ts --ignoreConfig --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2022,DOM --outDir .profile-name-test-build --skipLibCheck', {stdio:'inherit'});
const profile = await import('../.profile-name-test-build/profile.js');

assert.equal(profile.normalizeProfileWhitespace('  Ada   Lovelace  '), 'Ada Lovelace', 'trims and collapses whitespace');
assert.equal(profile.composeCanonicalShooterName('  Ada ', '  Lovelace  '), 'Ada Lovelace', 'composes canonical first and last name');
assert.equal(profile.composeCanonicalShooterName('Ada', ''), 'Ada', 'compose ignores empty last name');
assert.equal(profile.isShooterProfileComplete({first_name:'', last_name:'Lovelace', shooter_name:'Legacy Name', country:'NO', my_disciplines:['Sporting']}), false, 'first name is required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'', shooter_name:'Legacy Name', country:'NO', my_disciplines:['Sporting']}), false, 'last name is required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:null, country:'NO', my_disciplines:['Sporting']}), true, 'complete profile uses first, last, country and discipline');
assert.equal(profile.shooterProfileDisplayName({first_name:null, last_name:null, shooter_name:'  Legacy   Shooter  '}), 'Legacy Shooter', 'legacy shooter_name is display fallback');
assert.equal(profile.shooterProfileDisplayName({first_name:'  Ada ', last_name:' Lovelace ', shooter_name:'Legacy Shooter'}), 'Ada Lovelace', 'canonical name takes display precedence');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:'Ada Lovelace', country:'', my_disciplines:['Sporting']}), false, 'country remains required');
assert.equal(profile.isShooterProfileComplete({first_name:'Ada', last_name:'Lovelace', shooter_name:'Ada Lovelace', country:'NO', my_disciplines:[]}), false, 'discipline remains required');

execSync('rm -rf .profile-name-test-build');
console.log('profile name tests passed');
