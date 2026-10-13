import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { HazelchatTrigger } = require('../dist/nodes/HazelchatTrigger/HazelchatTrigger.node.js');
const { Hazelchat } = require('../dist/nodes/Hazelchat/Hazelchat.node.js');

const node = new HazelchatTrigger();
const methods = node.webhookMethods.default;
const target = 'https://fictional-n8n.example/webhook/0f8a6c2e-1111-4222-8333-444455556666/webhook';
const secret = 'hzs_' + '12'.repeat(32);

// An n8n hook context with the request helper replaced by canned answers.
function hookContext(answers, staticData = {}) {
  const calls = [];
  return {
    calls,
    staticData,
    context: {
      getWorkflowStaticData: () => staticData,
      getCredentials: async () => ({ apiKey: 'hzk_' + '0'.repeat(64), baseUrl: 'https://app.hazelchat.co' }),
      getNodeWebhookUrl: () => target,
      getNode: () => ({ id: 'n1', name: 'Hazelchat Trigger', type: 'n8n-nodes-hazelchat.hazelchatTrigger', typeVersion: 1, position: [0, 0], parameters: {} }),
      helpers: {
        httpRequestWithAuthentication: async (credential, options) => {
          calls.push({ credential, ...options });
          return answers.shift();
        },
      },
    },
  };
}

void test('create subscribes the production URL as n8n and keeps the id and secret in static data', async () => {
  const h = hookContext([{ statusCode: 201, body: { id: 'hook-1', secret } }]);
  assert.equal(await methods.create.call(h.context), true);
  assert.deepEqual(h.staticData, { hookId: 'hook-1', secret });
  assert.equal(h.calls.length, 1);
  const [call] = h.calls;
  assert.equal(call.credential, 'hazelchatApi');
  assert.equal(call.method, 'POST');
  assert.equal(call.baseURL, 'https://app.hazelchat.co');
  assert.equal(call.url, '/api/v1/hooks');
  assert.deepEqual(call.body, { target_url: target, platform: 'n8n' });
});

void test('create surfaces Hazelchat refusals and never stores a subscription without its secret', async () => {
  const refused = hookContext([{ statusCode: 403, body: { error: 'Sending enquiries to your tools is part of Business.' } }]);
  await assert.rejects(methods.create.call(refused.context), /part of Business/);
  assert.deepEqual(refused.staticData, {});
  const noSecret = hookContext([{ statusCode: 201, body: { id: 'hook-1' } }]);
  await assert.rejects(methods.create.call(noSecret.context), /did not return a subscription/);
  assert.deepEqual(noSecret.staticData, {});
});

void test('checkExists asks Hazelchat about the stored subscription and forgets one that is gone', async () => {
  const empty = hookContext([]);
  assert.equal(await methods.checkExists.call(empty.context), false);
  assert.equal(empty.calls.length, 0);
  const alive = hookContext([{ statusCode: 200, body: { id: 'hook-1', platform: 'n8n' } }], { hookId: 'hook-1', secret });
  assert.equal(await methods.checkExists.call(alive.context), true);
  assert.equal(alive.calls[0].method, 'GET');
  assert.equal(alive.calls[0].url, '/api/v1/hooks/hook-1');
  const gone = hookContext([{ statusCode: 404, body: { error: 'Subscription not found.' } }], { hookId: 'hook-1', secret });
  assert.equal(await methods.checkExists.call(gone.context), false);
  assert.deepEqual(gone.staticData, {});
  // Without its secret a subscription cannot be verified: create a new one.
  const lost = hookContext([], { hookId: 'hook-1' });
  assert.equal(await methods.checkExists.call(lost.context), false);
  const failing = hookContext([{ statusCode: 503, body: {} }], { hookId: 'hook-1', secret });
  await assert.rejects(methods.checkExists.call(failing.context));
  assert.deepEqual(failing.staticData, { hookId: 'hook-1', secret });
});

void test('delete removes the subscription, accepts one already gone and clears static data', async () => {
  for (const statusCode of [200, 404]) {
    const h = hookContext([{ statusCode, body: {} }], { hookId: 'hook/1', secret });
    assert.equal(await methods.delete.call(h.context), true);
    assert.equal(h.calls[0].method, 'DELETE');
    assert.equal(h.calls[0].url, '/api/v1/hooks/hook%2F1');
    assert.deepEqual(h.staticData, {});
  }
  const failing = hookContext([{ statusCode: 500, body: {} }], { hookId: 'hook-1', secret });
  await assert.rejects(methods.delete.call(failing.context));
});

// An n8n webhook context: the raw request as n8n received it.
function webhookContext({ rawBody, headers, staticData = { hookId: 'hook-1', secret } }) {
  const response = { code: 0, body: undefined };
  return {
    response,
    context: {
      getRequestObject: () => ({ rawBody, headers }),
      getResponseObject: () => ({
        status(code) {
          response.code = code;
          return this;
        },
        json(value) {
          response.body = value;
        },
      }),
      getBodyData: () => JSON.parse(rawBody.toString('utf8')),
      getWorkflowStaticData: () => staticData,
      helpers: { returnJsonArray: (data) => [data].flat().map((json) => ({ json })) },
    },
  };
}
function sign(text, at = Date.now(), key = secret) {
  const timestamp = String(Math.floor(at / 1000));
  return {
    'x-hazelchat-timestamp': timestamp,
    'x-hazelchat-signature': 'sha256=' + createHmac('sha256', key).update(`${timestamp}.${text}`).digest('hex'),
  };
}
const enquiry = JSON.stringify({ id: 'fictional-1', name: 'Fictional visitor', email: 'fictional@example.com' });

void test('a signed delivery starts the workflow with the enquiry', async () => {
  const w = webhookContext({ rawBody: Buffer.from(enquiry), headers: sign(enquiry) });
  const result = await node.webhook.call(w.context);
  assert.deepEqual(result, { workflowData: [[{ json: JSON.parse(enquiry) }]] });
  assert.equal(w.response.code, 0);
});

void test('a tampered body, a stale timestamp, a wrong secret or no signature answers 401 and starts nothing', async () => {
  const tampered = enquiry.replace('Fictional visitor', 'Forged');
  const cases = [
    { rawBody: Buffer.from(tampered), headers: sign(enquiry) },
    { rawBody: Buffer.from(enquiry), headers: sign(enquiry, Date.now() - 10 * 60 * 1000) },
    { rawBody: Buffer.from(enquiry), headers: sign(enquiry, Date.now(), 'hzs_' + '34'.repeat(32)) },
    { rawBody: Buffer.from(enquiry), headers: {} },
    { rawBody: Buffer.from(enquiry), headers: sign(enquiry), staticData: {} },
  ];
  for (const c of cases) {
    const w = webhookContext(c);
    const result = await node.webhook.call(w.context);
    assert.deepEqual(result, { noWebhookResponse: true });
    assert.equal(w.response.code, 401);
    assert.deepEqual(w.response.body, { error: 'Signature check failed.' });
  }
});

void test('the Hazelchat node only reads enquiries, newest first, with a limit of at most 100', () => {
  const description = new Hazelchat().description;
  const operation = description.properties.find((p) => p.name === 'operation');
  assert.deepEqual(
    operation.options.map((o) => [o.value, o.routing.request.method, o.routing.request.url]),
    [['getAll', 'GET', '/api/v1/enquiries']],
  );
  const limit = description.properties.find((p) => p.name === 'limit');
  assert.deepEqual([limit.typeOptions.minValue, limit.typeOptions.maxValue, limit.default], [1, 100, 50]);
  assert.deepEqual(limit.routing.send, { type: 'query', property: 'limit' });
  assert.equal(description.requestDefaults.baseURL, '={{$credentials.baseUrl}}');
});
