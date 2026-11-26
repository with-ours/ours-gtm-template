import vm from 'node:vm';
import { urlMatches } from './template.mjs';

export class PermissionError extends Error {}
export class AssertionError extends Error {}

export const getType = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
};

export const deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (getType(a) !== getType(b) || typeof a !== 'object' || a === null) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
};

const show = (v) => {
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === 'function' ? '[function]' : x === undefined ? '[undefined]' : x));
  } catch {
    return String(v);
  }
};

// One scenario's world: a fake window, template storage shared across runCode calls, mocks and a call log.
export const createScenario = ({ sandboxedJs, permissions }) => {
  const calls = {};
  const mocks = {};
  const windowObj = {};
  const storage = {};
  const logs = [];

  const record = (name, args) => (calls[name] = calls[name] || []).push(args);

  const checkGlobal = (key, mode) => {
    if (!permissions.globals[key]?.[mode]) {
      throw new PermissionError(`access_globals does not allow ${mode} on "${key}"`);
    }
  };

  // Permissions are enforced before mocks run, which is stricter than GTM's own test runner.
  const apis = {
    callInWindow: (key, ...args) => {
      checkGlobal(key, 'execute');
      const fn = windowObj[key];
      return typeof fn === 'function' ? fn(...args) : undefined;
    },
    copyFromWindow: (key) => {
      checkGlobal(key, 'read');
      return windowObj[key];
    },
    injectScript: (url) => {
      if (!permissions.injectUrls.some((p) => urlMatches(p, url))) {
        throw new PermissionError(`inject_script does not allow ${url}`);
      }
    },
    logToConsole: (...args) => {
      if (!permissions.logging) throw new PermissionError('logging permission missing');
      logs.push(args);
    },
    makeNumber: (v) => Number(v),
    getType,
    makeTableMap: (table, keyCol, valueCol) => {
      if (!Array.isArray(table)) return null;
      const out = {};
      for (const row of table) out[row[keyCol]] = row[valueCol];
      return out;
    },
    templateStorage: {
      getItem: (k) => storage[k],
      setItem: (k, v) => {
        storage[k] = v;
      },
      removeItem: (k) => {
        delete storage[k];
      },
      clear: () => {
        for (const k of Object.keys(storage)) delete storage[k];
      },
    },
    JSON: { parse: JSON.parse, stringify: JSON.stringify },
  };

  const permissionChecks = {
    callInWindow: (key) => checkGlobal(key, 'execute'),
    copyFromWindow: (key) => checkGlobal(key, 'read'),
    injectScript: (url) => apis.injectScript(url),
    templateStorage: () => {
      if (!permissions.templateStorage) throw new PermissionError('access_template_storage permission missing');
    },
  };

  const wrap = (name) => {
    if (!(name in apis)) throw new Error(`require('${name}') is not supported by this runner`);
    if (name === 'templateStorage') {
      permissionChecks.templateStorage();
      if (mocks.templateStorage) return mocks.templateStorage;
      return apis.templateStorage;
    }
    if (name === 'JSON' && mocks.JSON) return mocks.JSON;
    return (...args) => {
      record(name, args);
      if (name in mocks) {
        permissionChecks[name]?.(...args);
        const mock = mocks[name];
        return typeof mock === 'function' ? mock(...args) : mock;
      }
      return apis[name](...args);
    };
  };

  const runCode = (data) => {
    const tagData = { ...data };
    tagData.gtmOnSuccess = (...args) => record('gtmOnSuccess', args);
    tagData.gtmOnFailure = (...args) => record('gtmOnFailure', args);
    const context = vm.createContext({ data: tagData, require: wrap });
    return vm.runInContext(sandboxedJs, context, { filename: 'template.tpl#sandboxed-js' });
  };

  const assertApi = (name) => {
    const list = () => calls[name] || [];
    return {
      wasCalled: () => {
        if (!list().length) throw new AssertionError(`expected ${name} to be called`);
      },
      wasNotCalled: () => {
        if (list().length) throw new AssertionError(`expected ${name} not to be called, got ${show(list())}`);
      },
      wasCalledWith: (...args) => {
        if (!list().some((c) => deepEqual(c, args))) {
          throw new AssertionError(`expected ${name} called with ${show(args)}, got ${show(list())}`);
        }
      },
      wasNotCalledWith: (...args) => {
        if (list().some((c) => deepEqual(c, args))) {
          throw new AssertionError(`expected ${name} not called with ${show(args)}`);
        }
      },
    };
  };

  const assertThat = (actual, message) => {
    const check = (ok, what) => {
      if (!ok) throw new AssertionError(message || `expected ${show(actual)} ${what}`);
    };
    const subject = {
      isEqualTo: (e) => check(deepEqual(actual, e), `to equal ${show(e)}`),
      isNotEqualTo: (e) => check(!deepEqual(actual, e), `not to equal ${show(e)}`),
      isStrictlyEqualTo: (e) => check(actual === e, `to be ${show(e)}`),
      isNotStrictlyEqualTo: (e) => check(actual !== e, `not to be ${show(e)}`),
      isAnyOf: (...e) => check(e.some((x) => deepEqual(actual, x)), `to be any of ${show(e)}`),
      isNoneOf: (...e) => check(!e.some((x) => deepEqual(actual, x)), `to be none of ${show(e)}`),
      contains: (...e) => check(e.every((x) => actual.some((a) => deepEqual(a, x))), `to contain ${show(e)}`),
      doesNotContain: (...e) => check(!e.some((x) => actual.some((a) => deepEqual(a, x))), `not to contain ${show(e)}`),
      hasLength: (n) => check(actual?.length === n, `to have length ${n}`),
      isEmpty: () => check(actual?.length === 0, 'to be empty'),
      isNotEmpty: () => check(actual?.length > 0, 'not to be empty'),
      isArray: () => check(getType(actual) === 'array', 'to be an array'),
      isObject: () => check(getType(actual) === 'object', 'to be an object'),
      isString: () => check(typeof actual === 'string', 'to be a string'),
      isNumber: () => check(typeof actual === 'number', 'to be a number'),
      isBoolean: () => check(typeof actual === 'boolean', 'to be a boolean'),
      isFunction: () => check(typeof actual === 'function', 'to be a function'),
      isNull: () => check(actual === null, 'to be null'),
      isNotNull: () => check(actual !== null, 'not to be null'),
      isUndefined: () => check(actual === undefined, 'to be undefined'),
      isDefined: () => check(actual !== undefined, 'to be defined'),
      isTrue: () => check(actual === true, 'to be true'),
      isFalse: () => check(actual === false, 'to be false'),
      isTruthy: () => check(!!actual, 'to be truthy'),
      isFalsy: () => check(!actual, 'to be falsy'),
      isGreaterThan: (e) => check(actual > e, `to be > ${e}`),
      isGreaterThanOrEqualTo: (e) => check(actual >= e, `to be >= ${e}`),
      isLessThan: (e) => check(actual < e, `to be < ${e}`),
      isLessThanOrEqualTo: (e) => check(actual <= e, `to be <= ${e}`),
      isNaN: () => check(Number.isNaN(actual), 'to be NaN'),
      isNotNaN: () => check(!Number.isNaN(actual), 'not to be NaN'),
    };
    return subject;
  };

  return {
    runCode,
    assertApi,
    assertThat,
    mock: (name, value) => {
      mocks[name] = value;
    },
    mockObject: (name, value) => {
      mocks[name] = value;
    },
    fail: (message) => {
      throw new AssertionError(message || 'fail() called');
    },
    require: wrap,
    window: windowObj,
    logs,
  };
};
