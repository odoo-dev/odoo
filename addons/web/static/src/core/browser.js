/** @odoo-module **/

// -----------------------------------------------------------------------------
// browser object
// -----------------------------------------------------------------------------

let sessionStorage = window.sessionStorage;
let localStorage = owl.browser.localStorage;
try {
  // Safari crashes in Private Browsing
  localStorage.setItem("__localStorage__", "true");
  localStorage.removeItem("__localStorage__");
} catch (e) {
  localStorage = makeRAMLocalStorage();
  sessionStorage = makeRAMLocalStorage();
}

export const browser = Object.assign({}, owl.browser, {
  alert: window.alert.bind(window), // Alert needs the window context
  console: window.console,
  localStorage,
  location: window.location,
  navigator: navigator,
  open: window.open.bind(window),
  sessionStorage,
  XMLHttpRequest: window.XMLHttpRequest,
});

// -----------------------------------------------------------------------------
// Feature detection
// -----------------------------------------------------------------------------

/**
 * true if the browser is based on Chromium (Google Chrome, Opera, Edge)
 *
 * @type {boolean}
 */
export function isBrowserChrome() {
  return browser.navigator.userAgent.includes("Chrome");
}

export function isMacOS() {
  return Boolean(browser.navigator.platform.match(/Mac/i));
}

export function isMobileOS() {
  return Boolean(
    browser.navigator.userAgent.match(/Android/i) ||
      browser.navigator.userAgent.match(/webOS/i) ||
      browser.navigator.userAgent.match(/iPhone/i) ||
      browser.navigator.userAgent.match(/iPad/i) ||
      browser.navigator.userAgent.match(/iPod/i) ||
      browser.navigator.userAgent.match(/BlackBerry/i) ||
      browser.navigator.userAgent.match(/Windows Phone/i)
  );
}

export function isIosApp() {
  return navigator.userAgent.match(/OdooMobile \(iOS\)/i);
}

export function hasTouch() {
  return "ontouchstart" in window || "onmsgesturechange" in window;
}

// -----------------------------------------------------------------------------
// makeRAMLocalStorage
// -----------------------------------------------------------------------------

/**
 * @returns {typeof window["localStorage"]}
 */
export function makeRAMLocalStorage() {
  let store = {};
  return {
    setItem(key, value) {
      store[key] = value;
    },
    getItem(key) {
      return store[key];
    },
    clear() {
      store = {};
    },
    removeItem(key) {
      delete store[key];
    },
    get length() {
      return Object.keys(store).length;
    },
    key() {
      return "";
    },
  };
}
