const callInWindow = require('callInWindow');
const copyFromWindow = require('copyFromWindow');
const injectScript = require('injectScript');
const log = require('logToConsole');
const makeNumber = require('makeNumber');
const makeTableMap = require('makeTableMap');

const CDN_URL = 'https://cdn.oursprivacy.com';
const MAIN_JS_PATH = 'main.js';

// Normalize the input and return it
const normalize = (val) => {
  if (val === 'null') return null;
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  return makeNumber(val) || val;
};

// Normalize the template table
const normalizeTable = (table, prop, val) => {
  if (table && table.length) {
    table = table.map((row) => {
      const obj = {};
      obj[prop] = row[prop];
      obj[val] = normalize(row[val]);
      return obj;
    });
    return makeTableMap(table, prop, val);
  }
  return false;
};

// Normalize the three column table
const normalizeThreeColumnTable = (table, prop, val, behavior) => {
  if (table && table.length) {
    return table.reduce((acc, row) => {
      acc[row[prop]] = {};
      acc[row[prop]][val] = row[val];
      acc[row[prop]][behavior] = row[behavior];
      return acc;
    }, {});
  }
  return false;
};

// Handle install failure
const onInstallFailure = () => {
  log('Error: Failed to load the Ours JavaScript library');
  return data.gtmOnFailure();
};

// Handle install success and calls gtmOnSuccess
const onInstallSuccess = () => {
  const user_id = data.advanced_user_id_override;
  const custom_domain = data.advanced_custom_domain;
  let options = {};
  if (user_id) {
    options.user_id = user_id;
  }
  if (custom_domain) {
    options.custom_domain = custom_domain;
  }

  callInWindow('ours', 'init', data.token, options);
  data.gtmOnSuccess();
};

const onInstall = () => {
  const oursIsDefined = copyFromWindow('ours');
  if (!oursIsDefined) {
    const domain = data.advanced_custom_domain || CDN_URL;
    const script = domain + '/' + MAIN_JS_PATH;
    const cacheToken = 'ours-cache-token';
    injectScript(script, onInstallSuccess, onInstallFailure, cacheToken);
  } else {
    onInstallSuccess();
  }
};

// Handle track
const onTrack = () => {
  const ep = normalizeTable(data.track_eventProperties, 'property', 'value') || {};
  const up = normalizeTable(data.track_userProperties, 'property', 'value') || {};
  const dp = normalizeThreeColumnTable(data.track_defaultProperties, 'property', 'value', 'behavior') || {};
  if (data.track_distinctId) {
    ep['$distinct_id'] = data.track_distinctId;
  }

  callInWindow('ours', 'track', data.track_eventName, ep, up, dp);
  data.gtmOnSuccess();
};

// Handle identify
const onIdentify = () => {
  const userProperties = normalizeTable(data.identify_userProperties, 'property', 'value');
  callInWindow('ours', 'identify', userProperties || {});
  data.gtmOnSuccess();
};

// main entry point
const run = () => {
  switch (data.type) {
    case 'install':
      onInstall();
      break;

    case 'track':
      onTrack();
      break;

    case 'identify':
      onIdentify();
      break;

    default:
      log('Invalid tag type ', data.type);
      break;
  }
};

run();
