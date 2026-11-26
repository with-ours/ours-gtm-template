import { readFileSync } from 'node:fs';
import { readTemplate } from './template.mjs';

// GTM runs the sandboxed JS in template.tpl; src/main.js is the reviewable copy and must match it exactly.
const tpl = readTemplate('template.tpl').SANDBOXED_JS_FOR_WEB_TEMPLATE.split('\n');
const main = readFileSync('src/main.js', 'utf8').replace(/\n+$/, '').split('\n');

const firstDiff = tpl.findIndex((line, i) => line !== main[i]);
const diffAt = firstDiff === -1 && tpl.length !== main.length ? Math.min(tpl.length, main.length) : firstDiff;

if (diffAt === -1) {
  console.log('src/main.js matches the template sandboxed JS');
} else {
  console.error(`src/main.js differs from template.tpl ___SANDBOXED_JS_FOR_WEB_TEMPLATE___ at line ${diffAt + 1}:`);
  console.error(`  template.tpl: ${tpl[diffAt] ?? '<end of section>'}`);
  console.error(`  src/main.js:  ${main[diffAt] ?? '<end of file>'}`);
  process.exitCode = 1;
}
