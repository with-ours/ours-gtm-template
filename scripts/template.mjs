import { readFileSync } from 'node:fs';

export const readTemplate = (path) => splitSections(readFileSync(path, 'utf8'));

export const splitSections = (text) => {
  const sections = {};
  let current = null;
  for (const line of text.split('\n')) {
    const match = /^___([A-Z_]+)___$/.exec(line);
    if (match) {
      current = match[1];
      sections[current] = [];
    } else if (current) {
      sections[current].push(line);
    }
  }
  for (const key of Object.keys(sections)) {
    sections[key] = sections[key].join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
  }
  return sections;
};

// Parses only the YAML GTM writes for ___TESTS___: `scenarios:` with `- name:`/`code: |-` items and an optional `setup: |-`.
export const parseTests = (yaml) => {
  const lines = yaml.split('\n');
  const scenarios = [];
  let setup = '';
  let i = 0;
  const readBlock = (indent) => {
    const block = [];
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() !== '' && !line.startsWith(' '.repeat(indent))) break;
      block.push(line.slice(indent));
      i++;
    }
    return block.join('\n').replace(/\n+$/, '');
  };
  while (i < lines.length) {
    const line = lines[i++];
    const name = /^- name: (.*)$/.exec(line);
    if (name) {
      scenarios.push({ name: unquote(name[1].trim()), code: '' });
    } else if (/^ {2}code: \|-?$/.test(line)) {
      if (!scenarios.length) throw new Error('___TESTS___: code before any scenario name');
      scenarios[scenarios.length - 1].code = readBlock(4);
    } else if (/^setup: \|-?$/.test(line)) {
      setup = readBlock(2);
    } else if (line.trim() !== '' && line.trim() !== 'scenarios:') {
      throw new Error(`___TESTS___: unsupported line: ${line}`);
    }
  }
  return { setup, scenarios };
};

const unquote = (s) => (/^(['"]).*\1$/.test(s) ? s.slice(1, -1) : s);

export const parsePermissions = (json) => {
  const permissions = { globals: {}, injectUrls: [], templateStorage: false, logging: false };
  for (const { instance } of JSON.parse(json || '[]')) {
    const id = instance.key.publicId;
    const param = (key) => (instance.param || []).find((p) => p.key === key)?.value;
    if (id === 'access_globals') {
      for (const item of param('keys')?.listItem || []) {
        const entry = {};
        item.mapKey.forEach((k, idx) => {
          const v = item.mapValue[idx];
          entry[k.string] = v.type === 8 ? v.boolean : v.string;
        });
        permissions.globals[entry.key] = entry;
      }
    } else if (id === 'inject_script') {
      permissions.injectUrls = (param('urls')?.listItem || []).map((v) => v.string);
    } else if (id === 'access_template_storage') {
      permissions.templateStorage = true;
    } else if (id === 'logging') {
      permissions.logging = true;
    }
  }
  return permissions;
};

export const urlMatches = (pattern, url) => {
  const regex = new RegExp('^' + pattern.split('*').map(escapeRegex).join('.*') + '$');
  return regex.test(url);
};

const escapeRegex = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
