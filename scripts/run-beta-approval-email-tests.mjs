import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

writeFileSync('.beta-email-test-tsconfig.json', JSON.stringify({
  compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', target: 'ES2022', lib: ['ES2022', 'DOM'], outDir: '.beta-email-test-build', skipLibCheck: true, rootDir: '.', ignoreDeprecations: '6.0', types: ['node'] },
  include: ['lib/betaApprovalEmail.ts', 'lib/resendWebhook.ts'],
}));
execSync('rm -rf .beta-email-test-build && npx tsc -p .beta-email-test-tsconfig.json', { stdio: 'inherit' });
const email = await import('../.beta-email-test-build/lib/betaApprovalEmail.js');
const webhook = await import('../.beta-email-test-build/lib/resendWebhook.js');

const env = { RESEND_API_KEY: 're_test', BETA_APPROVAL_EMAIL_FROM: 'Beta <beta@example.test>', NEXT_PUBLIC_SITE_URL: 'https://example.test' };
let request;
const result = await email.sendBetaApprovalEmail({ name: 'Test Shooter', email: 'shooter@example.test' }, env, async (url, init) => {
  request = { url, init };
  return new Response(JSON.stringify({ id: 'email_123' }), { status: 200 });
});
assert.deepEqual(result, { messageId: 'email_123' }, 'send persists the Resend message ID from an accepted request');
assert.equal(JSON.parse(request.init.body).to, 'shooter@example.test', 'send addresses the requested tester');
await assert.rejects(() => email.sendBetaApprovalEmail({ name: 'Test', email: 'x@example.test' }, env, async () => new Response('{}', { status: 200 })), /message ID/, 'an accepted response without an ID is not recorded as trackable');
assert.equal(email.getBetaApprovalEmailConfigStatus({ ...env, NEXT_PUBLIC_SITE_URL: undefined, VERCEL_URL: 'preview.vercel.app' }).configured, true, 'VERCEL_URL fallback is consistently accepted by URL and config checks');

const secretBytes = Buffer.from('test-webhook-secret');
const secret = `whsec_${secretBytes.toString('base64')}`;
const timestamp = '1788771600';
const eventBody = JSON.stringify({ id: 'evt_delivered', type: 'email.delivered', created_at: '2026-09-07T09:01:00Z', data: { email_id: 'email_123' } });
const signature = `v1,${createHmac('sha256', secretBytes).update(`msg_1.${timestamp}.${eventBody}`).digest('base64')}`;
assert.equal(webhook.verifyResendWebhookSignature({ payload: eventBody, id: 'msg_1', timestamp, signature, secret, now: Number(timestamp) * 1000 }), true, 'valid current Resend/Svix signature passes');
assert.equal(webhook.verifyResendWebhookSignature({ payload: `${eventBody} `, id: 'msg_1', timestamp, signature, secret, now: Number(timestamp) * 1000 }), false, 'modified payload has an invalid signature');
assert.equal(webhook.verifyResendWebhookSignature({ payload: eventBody, id: 'msg_1', timestamp, signature, secret, now: Number(timestamp) * 1000 + 301_000 }), false, 'stale signed webhook is rejected');

const delivered = webhook.parseResendDeliveryEvent(eventBody, 'msg_1');
assert.equal(webhook.deliveryStatusForEvent(delivered.type), 'delivered', 'delivered webhook becomes delivered');
for (const [type, status] of [['email.bounced', 'bounced'], ['email.failed', 'failed']]) {
  const parsed = webhook.parseResendDeliveryEvent(JSON.stringify({ type, created_at: '2026-09-07T09:02:00Z', data: { email_id: 'email_123' } }), `msg_${status}`);
  assert.equal(webhook.deliveryStatusForEvent(parsed.type), status, `${type} remains a truthful failure state`);
}
const current = { messageId: 'email_123', eventId: 'msg_1', updatedAt: '2026-09-07T09:01:00Z' };
assert.equal(webhook.shouldApplyDeliveryEvent(current, delivered), false, 'duplicate webhook event is idempotent');
assert.equal(webhook.shouldApplyDeliveryEvent(current, { ...delivered, id: 'evt_old', createdAt: '2026-09-07T09:00:00Z' }), false, 'out-of-order older event cannot replace newer state');
assert.equal(webhook.shouldApplyDeliveryEvent(current, { ...delivered, id: 'evt_old_send', messageId: 'email_previous', createdAt: '2026-09-07T09:03:00Z' }), false, 'event from before a resend cannot replace the current message state');
assert.equal(webhook.shouldApplyDeliveryEvent({ messageId: 'email_new', eventId: null, updatedAt: '2026-09-07T09:04:00Z' }, { ...delivered, id: 'evt_new', messageId: 'email_new', createdAt: '2026-09-07T09:05:00Z' }), true, 'new resend message can receive later delivery state');
assert.equal(webhook.shouldApplyDeliveryEvent({ messageId: null, eventId: null, updatedAt: null }, delivered), false, 'legacy rows without a message ID do not receive fabricated status');

const adminRoute = readFileSync('app/api/beta-admin/interest/route.ts', 'utf8');
assert.match(adminRoute, /canManageBetaAccess\(profile\)/, 'send and resend retain existing admin-only authorization');
assert.match(adminRoute, /approval_email_delivery_status: "accepted"/, 'provider acceptance is recorded as accepted rather than delivered');
const webhookRoute = readFileSync('app/api/webhooks/resend/route.ts', 'utf8');
assert.ok(webhookRoute.indexOf('verifyResendWebhookSignature') < webhookRoute.indexOf('createClient(url, serviceKey'), 'signature verification happens before service-role database access');
assert.doesNotMatch(webhookRoute, /NEXT_PUBLIC_.*SERVICE_ROLE/, 'service-role secret is never exposed as a public variable');

rmSync('.beta-email-test-build', { recursive: true, force: true });
rmSync('.beta-email-test-tsconfig.json', { force: true });
console.log('Beta approval email delivery tests passed');
