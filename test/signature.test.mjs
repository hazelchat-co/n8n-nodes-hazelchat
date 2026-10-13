import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { verifySignature, TOLERANCE_SECONDS } = require('../dist/nodes/HazelchatTrigger/signature.js');

// A fictional secret and enquiry; the scheme as documented on /docs/api/.
const secret = 'hzs_' + 'ab'.repeat(32);
const body = JSON.stringify({ id: 'fictional-1', name: 'Fictional visitor', message: 'Line one\n<b>two</b>' });
const now = Date.UTC(2026, 9, 12, 8, 0, 0);
function signed(at = now, text = body, key = secret) {
  const timestamp = String(Math.floor(at / 1000));
  return {
    timestamp,
    signature: 'sha256=' + createHmac('sha256', key).update(`${timestamp}.${text}`).digest('hex'),
  };
}

void test('a request signed with the subscription secret passes, raw bytes or string', () => {
  const { timestamp, signature } = signed();
  for (const rawBody of [Buffer.from(body), body])
    assert.deepEqual(verifySignature({ secret, rawBody, timestamp, signature, now }), { ok: true });
});

void test('a changed body, timestamp or secret fails', () => {
  const { timestamp, signature } = signed();
  const tampered = body.replace('Fictional visitor', 'Someone else');
  assert.deepEqual(verifySignature({ secret, rawBody: tampered, timestamp, signature, now }), {
    ok: false,
    reason: 'mismatch',
  });
  assert.equal(
    verifySignature({ secret, rawBody: body, timestamp: String(Number(timestamp) - 1), signature, now }).reason,
    'mismatch',
  );
  const other = 'hzs_' + 'cd'.repeat(32);
  assert.equal(verifySignature({ secret: other, rawBody: body, timestamp, signature, now }).reason, 'mismatch');
  // Re-encoding the JSON (key order, spacing) is not the body Hazelchat signed.
  const reencoded = JSON.stringify(JSON.parse(body), null, 1);
  assert.equal(verifySignature({ secret, rawBody: reencoded, timestamp, signature, now }).reason, 'mismatch');
});

void test('a timestamp outside five minutes fails in either direction, even with a valid signature', () => {
  const window = TOLERANCE_SECONDS * 1000;
  for (const at of [now - window - 1000, now + window + 1000]) {
    const { timestamp, signature } = signed(at);
    assert.deepEqual(verifySignature({ secret, rawBody: body, timestamp, signature, now }), {
      ok: false,
      reason: 'stale',
    });
  }
  const edge = signed(now - window + 1000);
  assert.equal(verifySignature({ secret, rawBody: body, ...edge, now }).ok, true);
});

void test('missing, repeated or malformed headers and a missing secret fail', () => {
  const { timestamp, signature } = signed();
  const cases = [
    [{ secret: undefined }, 'no-secret'],
    [{ secret: 'not-a-secret' }, 'no-secret'],
    [{ timestamp: undefined }, 'malformed'],
    [{ signature: undefined }, 'malformed'],
    [{ signature: [signature, signature] }, 'malformed'],
    [{ timestamp: [timestamp] }, 'malformed'],
    [{ timestamp: '12.5' }, 'malformed'],
    [{ signature: signature.replace('sha256=', 'sha1=') }, 'malformed'],
    [{ signature: signature.slice(0, -2) }, 'malformed'],
    [{ rawBody: undefined }, 'malformed'],
  ];
  for (const [change, reason] of cases)
    assert.equal(
      verifySignature({ secret, rawBody: body, timestamp, signature, now, ...change }).reason,
      reason,
      JSON.stringify(change),
    );
});
