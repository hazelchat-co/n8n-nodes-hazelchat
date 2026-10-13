// Runs n8n's community-package scan on this package before it is published.
//
// `npx @n8n/scan-community-package n8n-nodes-hazelchat` only works on a
// version published to npm: it first checks the npm provenance statement,
// then lints the GitHub source that statement points to, then lints the
// published tarball. Before publishing, this script runs the same scanner's
// lint (its exported `analyzePackage` and `SOURCE_FILE_PATTERNS`, the same
// rule set) on the two things it would see: the source files and the files
// `npm pack` would publish. The provenance and attested-source steps cannot
// run here; they run against the first published version.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCANNER = '@n8n/scan-community-package@0.38.0';
const root = new URL('..', import.meta.url).pathname;
const scanDir = join(root, '.scan');
const entry = join(scanDir, 'node_modules/@n8n/scan-community-package/scanner/scanner.mjs');
// Its own folder: the scanner pins TypeScript 6, which must not replace the
// package's TypeScript 5 used by `n8n-node build`.
if (!existsSync(entry))
  execFileSync('npm', ['install', '--prefix', scanDir, '--no-save', '--no-audit', '--no-fund', SCANNER], {
    stdio: 'inherit',
  });
const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(pathToFileURL(entry).href);

const work = mkdtempSync(join(tmpdir(), 'hazelchat-n8n-scan-'));
let failed = false;
try {
  const source = await analyzePackage(root, SOURCE_FILE_PATTERNS);
  console.log(`Source (${SOURCE_FILE_PATTERNS.join(', ')}): ${source.passed ? 'passed' : 'FAILED'}`);
  if (source.details) console.log(source.details);
  execFileSync('npm', ['pack', '--pack-destination', work], { cwd: root, stdio: 'ignore' });
  const tarball = readdirSync(work).find((file) => file.endsWith('.tgz'));
  const unpacked = join(work, 'package');
  execFileSync('tar', ['-xzf', tarball, '-C', work], { cwd: work });
  const shipped = await analyzePackage(unpacked, ['**/*.js', 'package.json']);
  console.log(`Packed tarball ${tarball} (**/*.js, package.json): ${shipped.passed ? 'passed' : 'FAILED'}`);
  if (shipped.details) console.log(shipped.details);
  failed = !source.passed || !shipped.passed;
} finally {
  rmSync(work, { recursive: true, force: true });
}
console.log('Not run before publishing: the npm provenance check and the scan of the attested GitHub source.');
process.exit(failed ? 1 : 0);
