const callInWindow = require('callInWindow');
const copyFromWindow = require('copyFromWindow');
const injectScript = require('injectScript');
const log = require('logToConsole');
const makeNumber = require('makeNumber');
const makeTableMap = require('makeTableMap');
const templateStorage = require('templateStorage');

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

const isOursDefined = () => {
  return !!copyFromWindow('ours');
};

const storeInTemplateStorage = (value) => {
  const items = templateStorage.getItem('queued') || [];
  items.push(value);
  templateStorage.setItem('queued', items);
};

const getFromTemplateStorage = () => {
  return templateStorage.getItem('queued');
};

// Handle inject failure
const onInjectFailure = () => {
  log('Error: Failed to load the Ours JavaScript library');
  return data.gtmOnFailure();
};

// Handle install
const onInstall = () => {
  let options = {};
  if (data.track_web_events) {
    options.track_web_events = data.track_web_events;
  }
  if (data.advanced_user_id_override) {
    options.user_id = data.advanced_user_id_override;
  }
  if (data.advanced_custom_domain) {
    options.custom_domain = data.advanced_custom_domain;
  }
  if (typeof data.consentEnabled === 'boolean') {
    options.consentEnabled = data.consentEnabled;
  }
  if (data.consentVendor) {
    options.consentVendor = data.consentVendor;
  }
  if (data.consentGranted) {
    options.consentGranted = data.consentGranted;
  }
  if (data.consentGrantedCategory) {
    options.consentGrantedCategory = data.consentGrantedCategory;
  }
  if (data.consentCategories) {
    options.consentCategories = data.consentCategories;
  }

  callInWindow('ours', 'init', data.token, options);
  const items = getFromTemplateStorage() || [];
  items.forEach((item) => {
    callInWindow('ours', item[0], item[1], item[2], item[3], item[4]);
  });
  data.gtmOnSuccess();
};

const onInjectScriptThenInstall = () => {
  if (!isOursDefined()) {
    const domain = data.advanced_custom_domain || CDN_URL;
    const script = domain + '/' + MAIN_JS_PATH;
    const cacheToken = 'ours-cache-token';
    injectScript(script, onInstall, onInjectFailure, cacheToken);
  } else {
    onInstall();
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

  if (isOursDefined()) {
    callInWindow('ours', 'track', data.track_eventName, ep, up, dp);
  } else {
    storeInTemplateStorage(['track', data.track_eventName, ep, up, dp]);
  }
  data.gtmOnSuccess();
};

// Handle identify
const onIdentify = () => {
  const userProperties = normalizeTable(data.identify_userProperties, 'property', 'value');
  if (isOursDefined()) {
    callInWindow('ours', 'identify', userProperties || {});
  } else {
    storeInTemplateStorage(['identify', userProperties]);
  }
  data.gtmOnSuccess();
};

// main entry point
const run = () => {
  switch (data.type) {
    case 'install':
      onInjectScriptThenInstall();
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