const callInWindow = require('callInWindow');
const copyFromWindow = require('copyFromWindow');
const injectScript = require('injectScript');
const log = require('logToConsole');
const makeNumber = require('makeNumber');
const getType = require('getType');
const makeTableMap = require('makeTableMap');
const templateStorage = require('templateStorage');

const CDN_URL = 'https://cdn.oursprivacy.com';
const MAIN_JS_PATH = 'main.js';

// Normalize the input and return it
const normalize = (val) => {
  if (val === 'null') return null;
  if (val === 'true' || val === true) return true;
  if (val === 'false' || val === false) return false;
  // Preserve strings that start with '+' (e.g. E.164 phone numbers like +15551234567)
  if (getType(val) === 'string' && val.indexOf('+') === 0) return val;
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

// Deep merge two objects recursively
const deepMerge = (target, source) => {
  const result = {};
  for (var key in target) {
    result[key] = target[key];
  }
  for (var k in source) {
    if (getType(result[k]) === 'object' && getType(source[k]) === 'object') {
      result[k] = deepMerge(result[k], source[k]);
    } else {
      result[k] = source[k];
    }
  }
  return result;
};

// Merge a table result with an object variable input
const mergeWithObject = (tableResult, objectVariable) => {
  const tableObj = tableResult || {};
  const varObj = getType(objectVariable) === 'object' ? objectVariable : {};
  return deepMerge(varObj, tableObj);
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
  if (data.enhanced_web_events) {
    options.enhanced_web_events = data.enhanced_web_events;
  }
  if (data.advanced_force_ipv4) {
    options.force_ipv4 = data.advanced_force_ipv4;
  }
  if (data.advanced_custom_domain) {
    options.custom_domain = data.advanced_custom_domain;
  }
  if (data.advanced_custom_domain_ipv4) {
    options.custom_domain_ipv4 = data.advanced_custom_domain_ipv4;
  }
  if (data.advanced_user_id_override) {
    options.user_id = data.advanced_user_id_override;
  }
  if (data.advanced_device_id_cookie_name || data.advanced_sdk_data_cookie_name) {
    options.cookie_names = {};
    if (data.advanced_device_id_cookie_name) {
      options.cookie_names.device_id = data.advanced_device_id_cookie_name;
    }
    if (data.advanced_sdk_data_cookie_name) {
      options.cookie_names.sdk_data = data.advanced_sdk_data_cookie_name;
    }
  }
  if (data.advanced_session_replay_token) {
    options.session_replay = { token: data.advanced_session_replay_token };
  }
  if (data.advanced_experimentation_token) {
    options.experimentation = { token: data.advanced_experimentation_token };
  }
  if (data.advanced_bot_detection) {
    options.bot_detection = data.advanced_bot_detection;
  }
  const default_event_properties_table = normalizeTable(data.default_event_properties, 'property', 'value');
  const default_event_properties = mergeWithObject(default_event_properties_table, data.default_event_properties_object);
  const default_user_custom_properties = normalizeTable(data.default_user_custom_properties, 'property', 'value');
  const default_user_consent_properties = normalizeTable(data.default_user_consent_properties, 'property', 'value');
  if (default_event_properties && getType(default_event_properties) === 'object') {
    var hasKeys = false;
    for (var k in default_event_properties) { hasKeys = true; break; }
    if (hasKeys) options.default_event_properties = default_event_properties;
  }
  if (default_user_custom_properties) {
    options.default_user_custom_properties = default_user_custom_properties;
  }
  if (default_user_consent_properties) {
    options.default_user_consent_properties = default_user_consent_properties;
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
  const epTable = normalizeTable(data.track_eventProperties, 'property', 'value');
  const ep = mergeWithObject(epTable, data.track_eventPropertiesObject);
  const up = normalizeTable(data.track_userProperties, 'property', 'value') || {};
  const dp = normalizeThreeColumnTable(data.track_defaultProperties, 'property', 'value', 'behavior') || {};
  const userConsentProperties = normalizeTable(data.track_userProperties_consent, 'property', 'value');
  const userCustomProperties = normalizeTable(data.track_userProperties_custom_properties, 'property', 'value');
  if (userConsentProperties) {
    up.consent = userConsentProperties;
  }
  if (userCustomProperties) {
    up.custom_properties = userCustomProperties;
  }

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
  const userProperties = normalizeTable(data.identify_userProperties, 'property', 'value') || {};
  const userConsentProperties = normalizeTable(data.track_userProperties_consent, 'property', 'value');
  const userCustomProperties = normalizeTable(data.track_userProperties_custom_properties, 'property', 'value');
  if (userConsentProperties) {
    userProperties.consent = userConsentProperties;
  }
  if (userCustomProperties) {
    userProperties.custom_properties = userCustomProperties;
  }
  if (isOursDefined()) {
    callInWindow('ours', 'identify', userProperties);
  } else {
    storeInTemplateStorage(['identify', userProperties]);
  }
  data.gtmOnSuccess();
};

// Handle reset
const onReset = () => {
  const optionalResetVisitorId = data.reset_nextVisitorId;
  if (isOursDefined()) {
    callInWindow('ours', 'reset', optionalResetVisitorId);
  } else if (optionalResetVisitorId) {
    storeInTemplateStorage(['reset', optionalResetVisitorId]);
  } else {
    storeInTemplateStorage(['reset']);
  }
  data.gtmOnSuccess();
};

// Handle updateDefaultEventProperties
const onUpdateDefaultEventProperties = () => {
  const propertiesTable = normalizeTable(data.updateDefaultEventProperties_properties, 'property', 'value');
  const properties = mergeWithObject(propertiesTable, data.updateDefaultEventProperties_propertiesObject);
  var hasProps = false;
  for (var k in properties) { hasProps = true; break; }
  if (isOursDefined()) {
    if (hasProps) {
      callInWindow('ours', 'updateDefaultEventProperties', properties);
    }
  } else {
    if (hasProps) storeInTemplateStorage(['updateDefaultEventProperties', properties]);
  }
  data.gtmOnSuccess();
};

// Handle updateDefaultUserCustomProperties
const onUpdateDefaultUserCustomProperties = () => {
  const properties = normalizeTable(data.updateDefaultUserCustomProperties_properties, 'property', 'value');
  if (isOursDefined()) {
    if (properties) {
      callInWindow('ours', 'updateDefaultUserCustomProperties', properties);
    }
  } else {
    storeInTemplateStorage(['updateDefaultUserCustomProperties', properties]);
  }
  data.gtmOnSuccess();
};

// Handle updateDefaultUserConsentProperties
const onUpdateDefaultUserConsentProperties = () => {
  const properties = normalizeTable(data.updateDefaultUserConsentProperties_properties, 'property', 'value');
  if (isOursDefined()) {
    if (properties) {
      callInWindow('ours', 'updateDefaultUserConsentProperties', properties);
    }
  } else {
    storeInTemplateStorage(['updateDefaultUserConsentProperties', properties]);
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

    case 'reset':
      onReset();
      break;

    case 'updateDefaultEventProperties':
      onUpdateDefaultEventProperties();
      break;

    case 'updateDefaultUserCustomProperties':
      onUpdateDefaultUserCustomProperties();
      break;

    case 'updateDefaultUserConsentProperties':
      onUpdateDefaultUserConsentProperties();
      break;

    default:
      log('Invalid tag type ', data.type);
      break;
  }
};

run();
