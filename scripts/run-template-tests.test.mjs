import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runTemplateTests } from './run-template-tests.mjs';
import { PermissionError } from './sandbox.mjs';
import { readTemplate } from './template.mjs';

const permissions = readTemplate('template.tpl').WEB_PERMISSIONS;

const sandboxedJs = `
const injectScript = require('injectScript');
const templateStorage = require('templateStorage');
const count = (templateStorage.getItem('runs') || 0) + 1;
templateStorage.setItem('runs', count);
if (data.url) injectScript(data.url, data.gtmOnSuccess, data.gtmOnFailure);
if (count === data.expectRuns) data.gtmOnSuccess(); else data.gtmOnFailure();
`;

const scenarios = (...items) =>
  'scenarios:\n' +
  items.map(([name, code]) => `- name: ${name}\n  code: |-\n${code.split('\n').map((l) => '    ' + l).join('\n')}`).join('\n');

const run = (tests) => runTemplateTests({ SANDBOXED_JS_FOR_WEB_TEMPLATE: sandboxedJs, WEB_PERMISSIONS: permissions, TESTS: tests });

test('a failed assertion fails only its scenario', () => {
  const [pass, fail] = run(
    scenarios(
      ['passes', "runCode({expectRuns: 1});\nassertApi('gtmOnSuccess').wasCalled();"],
      ['fails', "runCode({expectRuns: 2});\nassertApi('gtmOnSuccess').wasCalled();"],
    ),
  );
  assert.equal(pass.ok, true);
  assert.equal(fail.ok, false);
  assert.match(fail.error.message, /expected gtmOnSuccess to be called/);
});

test('template storage persists across runCode calls in a scenario and resets between scenarios', () => {
  const results = run(
    scenarios(
      ['twice', "runCode({});\nrunCode({expectRuns: 2});\nassertApi('gtmOnSuccess').wasCalled();"],
      ['fresh', "runCode({expectRuns: 1});\nassertApi('gtmOnFailure').wasNotCalled();"],
    ),
  );
  assert.deepEqual(results.map((r) => r.ok), [true, true]);
});

test('inject_script permissions are enforced even when injectScript is mocked', () => {
  const [allowed, blocked] = run(
    scenarios(
      ['cdn', "mock('injectScript', () => {});\nrunCode({url: 'https://cdn.oursprivacy.com/main.js'});"],
      ['custom domain', "mock('injectScript', () => {});\nrunCode({url: 'https://t.example.com/main.js'});"],
    ),
  );
  assert.equal(allowed.ok, true);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.error instanceof PermissionError);
});

test('setup code runs before every scenario', () => {
  const results = runTemplateTests({
    SANDBOXED_JS_FOR_WEB_TEMPLATE: sandboxedJs,
    WEB_PERMISSIONS: permissions,
    TESTS: scenarios(['uses setup', 'runCode(base);\nassertApi("gtmOnSuccess").wasCalled();']) + '\nsetup: |-\n  const base = {expectRuns: 1};',
  });
  assert.deepEqual(results.map((r) => r.ok), [true]);
});
