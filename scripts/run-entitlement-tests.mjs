import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

writeFileSync('.entitlement-test-tsconfig.json', JSON.stringify({ compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022','DOM'], types: ['node'], outDir: '.entitlement-test-build', skipLibCheck: true, rootDir: '.', baseUrl: '.', paths: { '@/*': ['./*'] }, ignoreDeprecations: '6.0' }, include: ['lib/entitlements/**/*.ts'] }));
execFileSync('npx', ['tsc', '-p', '.entitlement-test-tsconfig.json'], { stdio: 'inherit' });
const { FEATURE_CATALOG, FEATURE_KEYS } = await import('../.entitlement-test-build/lib/entitlements/features.js');
const { canUseFeature, getBillingMode, shouldBlockPaidCostFeature, shouldShowProPreview } = await import('../.entitlement-test-build/lib/entitlements/check.js');

assert.equal(getBillingMode({}), 'beta_hidden');
assert.equal(FEATURE_KEYS.length, new Set(FEATURE_KEYS).size, 'feature keys are stable and unique');
assert.equal(FEATURE_CATALOG['data.compliance_access'].tier, 'compliance_access');
assert.equal(FEATURE_CATALOG['ai.coach_report_summary'].costSensitive, true);
assert.equal(canUseFeature({ billingMode: 'beta_hidden', isApprovedBetaUser: true, plan: 'free' }, 'coach_report.generate').allowed, true);
assert.equal(shouldShowProPreview({ billingMode: 'beta_hidden', isApprovedBetaUser: true, plan: 'free' }, 'coach_report.generate'), false);
assert.equal(shouldShowProPreview({ billingMode: 'preview_only', plan: 'free' }, 'performance.advanced_trends'), false, 'preview trial access can use configured trial features');
assert.equal(shouldShowProPreview({ billingMode: 'enabled', plan: 'free' }, 'performance.advanced_trends'), true);
assert.equal(canUseFeature({ billingMode: 'enabled', plan: 'pro' }, 'ai.coach_report_summary').allowed, true);
assert.equal(shouldBlockPaidCostFeature({ billingMode: 'enabled', plan: 'free' }, 'ai.coach_report_summary'), true);
assert.equal(shouldBlockPaidCostFeature({ billingMode: 'enabled', plan: 'tester' }, 'ai.coach_report_summary'), false);
assert.equal(shouldBlockPaidCostFeature({ billingMode: 'preview_only', plan: 'free' }, 'ai.coach_report_summary'), false);
rmSync('.entitlement-test-build', { recursive: true, force: true });
rmSync('.entitlement-test-tsconfig.json', { force: true });
console.log('entitlement foundation tests passed');
