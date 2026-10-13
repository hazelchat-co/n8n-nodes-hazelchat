import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

void test('the package has no runtime dependencies and the shape n8n verification expects', () => {
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.optionalDependencies, undefined);
  assert.equal(pkg.bundleDependencies ?? pkg.bundledDependencies, undefined);
  assert.equal(pkg.overrides, undefined);
  assert.deepEqual(pkg.peerDependencies, { 'n8n-workflow': '*' });
  assert.match(pkg.name, /^n8n-nodes-/);
  assert.ok(pkg.keywords.includes('n8n-community-node-package'));
  assert.equal(pkg.license, 'MIT');
  assert.deepEqual(pkg.files, ['dist', '!dist/tsconfig.tsbuildinfo']);
  assert.equal(pkg.n8n.strict, true);
  // npm's trusted publishing and n8n's source check compare this with the
  // GitHub repository; npm rewrites any other spelling at publish.
  assert.equal(pkg.repository.url, 'git+https://github.com/hazelchat-co/n8n-nodes-hazelchat.git');
  assert.deepEqual(pkg.author, { name: 'Hazelchat', email: 'hello@hazelchat.co' });
  // No install-time scripts run on an owner's n8n.
  for (const script of ['preinstall', 'install', 'postinstall', 'prepare'])
    assert.equal(pkg.scripts[script], undefined, script);
  for (const file of [...pkg.n8n.nodes, ...pkg.n8n.credentials])
    assert.ok(existsSync(join(root, file)), `${file} is built`);
});

void test('the credential takes one secret field and checks it on /api/v1/me', () => {
  const { HazelchatApi } = require('../dist/credentials/HazelchatApi.credentials.js');
  const credential = new HazelchatApi();
  const visible = credential.properties.filter((p) => p.type !== 'hidden');
  assert.deepEqual(
    visible.map((p) => [p.name, p.typeOptions?.password, p.required]),
    [['apiKey', true, true]],
  );
  const base = credential.properties.find((p) => p.name === 'baseUrl');
  assert.deepEqual([base.type, base.default], ['hidden', 'https://app.hazelchat.co']);
  assert.deepEqual(credential.test.request, { baseURL: '={{$credentials.baseUrl}}', url: '/api/v1/me' });
  assert.deepEqual(credential.authenticate.properties.headers, {
    Authorization: '=Bearer {{$credentials.apiKey}}',
  });
});

void test('compiled nodes call only the read and subscription routes, never env, files or other hosts', () => {
  const files = readdirSync(join(root, 'dist'), { recursive: true })
    .filter((f) => String(f).endsWith('.js'))
    .map((f) => readFileSync(join(root, 'dist', String(f)), 'utf8'));
  const source = files.join('\n');
  const routes = new Set(source.match(/['"`]\/api\/v1\/[a-z/]*/g)?.map((r) => r.slice(1)));
  assert.deepEqual([...routes].sort(), ['/api/v1/enquiries', '/api/v1/hooks', '/api/v1/hooks/', '/api/v1/me']);
  assert.deepEqual([...new Set(source.match(/https?:\/\/[^'"`\s)]+/g))].sort(), [
    'https://app.hazelchat.co',
    'https://hazelchat.co/docs/api/#authentication',
  ]);
  assert.doesNotMatch(source, /process\.env|require\(['"](fs|child_process|http|https|net)['"]\)/);
  assert.doesNotMatch(source, /method:\s*['"](PUT|PATCH)['"]/);
});

void test('the published tarball holds only the built nodes, credential, icons, README and licence', () => {
  const [packed] = JSON.parse(
    execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' }),
  );
  const paths = packed.files.map((f) => f.path).sort();
  for (const path of paths)
    assert.match(
      path,
      /^(LICENSE\.md|README\.md|package\.json|dist\/package\.json|dist\/icons\/[a-z.]+\.svg|dist\/(nodes|credentials)\/[A-Za-z/.]+\.(js|js\.map|d\.ts|json))$/,
      path,
    );
  for (const file of [...pkg.n8n.nodes, ...pkg.n8n.credentials, 'dist/icons/hazelchat.svg', 'dist/icons/hazelchat.dark.svg'])
    assert.ok(paths.includes(file), `${file} is published`);
});

void test('the publish workflow runs only on version tags, with provenance', () => {
  const workflow = readFileSync(join(root, '.github/workflows/publish.yml'), 'utf8');
  assert.match(workflow, /on:\n {2}push:\n {4}tags:/);
  assert.doesNotMatch(workflow, /branches:/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /npm run release/);
});
