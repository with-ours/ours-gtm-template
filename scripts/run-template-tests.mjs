import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parsePermissions, parseTests, readTemplate } from './template.mjs';
import { createScenario } from './sandbox.mjs';

export const runTemplateTests = (sections) => {
  const sandboxedJs = sections.SANDBOXED_JS_FOR_WEB_TEMPLATE;
  if (!sandboxedJs) throw new Error('template has no ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ section');
  const permissions = parsePermissions(sections.WEB_PERMISSIONS);
  const { setup, scenarios } = parseTests(sections.TESTS || '');
  return scenarios.map(({ name, code }) => {
    const scenario = createScenario({ sandboxedJs, permissions });
    const context = vm.createContext({
      runCode: scenario.runCode,
      assertApi: scenario.assertApi,
      assertThat: scenario.assertThat,
      mock: scenario.mock,
      mockObject: scenario.mockObject,
      fail: scenario.fail,
      require: scenario.require,
    });
    try {
      vm.runInContext(`${setup}\n${code}`, context, { filename: `scenario: ${name}` });
      return { name, ok: true };
    } catch (error) {
      return { name, ok: false, error };
    }
  });
};

const main = () => {
  const path = process.argv[2] || 'template.tpl';
  const results = runTemplateTests(readTemplate(path));
  for (const r of results) {
    console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
    if (!r.ok) console.log(`     ${r.error.constructor.name}: ${r.error.message}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed (${path})`);
  if (!results.length) {
    console.log('no scenarios found');
    process.exitCode = 1;
  }
  if (failed) process.exitCode = 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
