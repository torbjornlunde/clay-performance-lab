import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const output = '.competition-entry-test-build';
rmSync(output, { recursive: true, force: true });
execFileSync('npx', ['tsc', 'lib/publishedResultImport.ts', '--ignoreConfig', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--outDir', output, '--skipLibCheck'], { stdio: 'inherit' });
const { publishedResultImportHref, publishedResultProvider } = await import(`../${output}/publishedResultImport.js`);

assert.equal(publishedResultProvider('https://clayarena.com/en/competitions/open/results/'), 'clayarena');
assert.equal(publishedResultProvider('https://results.clayarena.com/event/1'), null);
for (const url of ['http://clayarena.com/en/competitions/open/results/', 'ftp://leirdue.net/resultater', 'https://name@clayarena.com/en/competitions/open/results/', 'https://clayarena.com:8080/en/competitions/open/results/', 'https://results.leirdue.net/resultater', 'https://clayarena.com/en/profile/x', 'https://clayarena.com/en/competitions/open/', 'https://leirdue.net/', 'https://leirdue.net/?stevne=']) assert.equal(publishedResultProvider(url), null, `unsupported importer address: ${url}`);
assert.equal(publishedResultProvider('https://www.leirdue.net/resultater?stevne=42'), 'leirdue');
assert.equal(publishedResultProvider('https://fakeleirdue.net/resultater'), null);
assert.equal(publishedResultProvider('not a URL'), null);
assert.equal(publishedResultProvider('http://leirdue.net/?liste_id=12'), 'leirdue');
assert.equal(publishedResultProvider('https://www.clayarena.com/competitions/open-2026/results/'), 'clayarena');
assert.equal(publishedResultImportHref('clayarena', ' https://clayarena.com/results?a=1&b=2 '), '/import/clayarena?url=https%3A%2F%2Fclayarena.com%2Fresults%3Fa%3D1%26b%3D2');

const entry = readFileSync('app/log-competition/page.tsx', 'utf8');
assert.match(entry, /href="\/results\/new"[\s\S]*Add competition/, 'recommended action adds a competition');
assert.match(entry, /href="\/import"[\s\S]*Import/, 'one published-result entry is visible');
assert.doesNotMatch(entry, /primaryAction[^\n]*(Competition Score Sheet|My results)/, 'live sheet and history are not primary actions');
for (const route of ['/competition-score-sheets', '/results/quick', '/sessions/new?type=competition', '/results']) assert.match(entry, new RegExp(route.replace(/[/?]/g, '\\$&')), `${route} remains reachable`);

const hub = readFileSync('app/import/page.tsx', 'utf8');
assert.match(hub, /<h1 id="import-heading">Import<\/h1>/, 'hub title is simply Import');
assert.match(hub, /Choose result service/, 'provider choice precedes the optional link field');
assert.match(readFileSync('app/import/result/page.tsx', 'utf8'), /redirect\("\/import"\)/, 'previous hub route remains usable');
for (const provider of ['ClayArena', 'Leirdue.net']) assert.match(hub, new RegExp(provider.replace('.', '\\.')), `${provider} is first-class in import hub`);
for (const [file, expected] of [['app/import/clayarena/page.tsx', 'new URLSearchParams(window.location.search)'], ['app/import/leirdue/page.tsx', 'new URLSearchParams(window.location.search)']]) assert.match(readFileSync(file, 'utf8'), new RegExp(expected.replace(/[().]/g, '\\$&')), `${file} accepts forwarded URL`);

rmSync(output, { recursive: true, force: true });
console.log('competition entry navigation and routing tests passed');
