const callInWindow = require("callInWindow");
const copyFromWindow = require("copyFromWindow");
const injectScript = require("injectScript");
const log = require("logToConsole");
const makeNumber = require("makeNumber");
const makeTableMap = require("makeTableMap");

const LOG_PREFIX = "[Ours / GTM] ";
const WRAPPER_NAMESPACE = "ours";
const CDN_URL = "https://cdn.oursprivacy.com/main.js";

// Print a log message and set the tag to failed state
const fail = (msg) => {
    log(LOG_PREFIX + "Error: " + msg);
    return data.gtmOnFailure();
};

// Normalize the input and return it
const normalize = (val) => {
    if (val === "null") return null;
    if (val === "true" || val === true) return true;
    if (val === "false" || val === false) return false;
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

// Handle the initializing of the Ours library
const handleInit = () => {
    const user_id = data.advanced_user_id_override;
    if (user_id) {
        callInWindow("ours", "init", data.token, { user_id });
    } else {
        callInWindow("ours", "init", data.token);
    }
}

// Handle the failure of the tag
const onFailure = () => {
    return fail("Failed to load the Ours JavaScript library");
};

// Handle the success of the tag
const onSuccess = () => {
    handleInit();

    switch (data.type) {
        case "install":
            log('installed');
            // does nothing else - ensures the injectScript is called below.
            break;
        case "track":
            const trackEventProperties =
                normalizeTable(data.track_eventProperties, "property", "value") || {};
            const trackUserProperties =
                normalizeTable(data.track_userProperties, "property", "value") || {};
            const trackDefaultProperties =
                normalizeThreeColumnTable(data.track_defaultProperties, "property", "value", "behavior") || {};
            if (data.track_distinctId) {
                trackEventProperties['$distinct_id'] = data.track_distinctId;
            }
            callInWindow(
                "ours",
                "track",
                data.track_eventName,
                trackEventProperties,
                trackUserProperties,
                trackDefaultProperties
            );
            break;

        case "identify":
            const userProperties =
                normalizeTable(data.identify_userProperties, "property", "value") || {};
            callInWindow("ours", "identify", userProperties);
            break;
    }

    data.gtmOnSuccess();
};

// Check if namespace already exists
const _ours = copyFromWindow(WRAPPER_NAMESPACE);
if (!_ours) {
    injectScript(CDN_URL, onSuccess, onFailure, "ours");
} else {
    onSuccess();
}