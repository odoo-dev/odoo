import * as QUnit from "qunit";

// -----------------------------------------------------------------------------
// QUnit config
// -----------------------------------------------------------------------------

QUnit.config.autostart = false;
QUnit.config.testTimeout = 1 * 60 * 1000;

// -----------------------------------------------------------------------------
// QUnit assert
// -----------------------------------------------------------------------------

/**
 * Checks that the target element contains exactly n matches for the selector.
 *
 * Example: assert.containsN(document.body, '.modal', 0)
 *
 * @param {HTMLElement} el
 * @param {string} selector
 * @param {number} n
 * @param {string} [msg]
 */
function containsN(el: HTMLElement, selector: string, n: number, msg?: string): void {
  msg = msg || `Selector '${selector}' should have exactly ${n} matches inside the target`;
  const matches = el.querySelectorAll(selector);
  QUnit.assert.strictEqual(matches.length, n, msg);
}

/**
 * Checks that the target element contains exactly 0 match for the selector.
 *
 * @param {HTMLElement} el
 * @param {string} selector
 * @param {string} [msg]
 */
function containsNone(el: HTMLElement, selector: string, msg?: string) {
  containsN(el, selector, 0, msg);
}

/**
 * Checks that the target element contains exactly 1 match for the selector.
 *
 * @param {HTMLElement} el
 * @param {string} selector
 * @param {string} [msg]
 */
function containsOnce(el: HTMLElement, selector: string, msg?: string) {
  containsN(el, selector, 1, msg);
}

/**
 * Helper function, to check if a given element has (or has not) classnames.
 *
 * @private
 * @param {HTMLElement} el
 * @param {string} classNames
 * @param {boolean} shouldHaveClass
 * @param {string} [msg]
 */
function _checkClass(el: HTMLElement, classNames: string, shouldHaveClass: boolean, msg?: string) {
  msg = msg || `target should ${shouldHaveClass ? "have" : "not have"} classnames ${classNames}`;
  const isFalse = classNames.split(" ").some((cls) => {
    const hasClass = el.classList.contains(cls);
    return shouldHaveClass ? !hasClass : hasClass;
  });
  QUnit.assert.ok(!isFalse, msg);
}

/**
 * Checks that the target element has the given classnames.
 *
 * @param {HTMLElement} el
 * @param {string} classNames
 * @param {string} [msg]
 */
function hasClass(el: HTMLElement, classNames: string, msg?: string) {
  _checkClass(el, classNames, true, msg);
}

/**
 * Checks that the target element does not have the given classnames.
 *
 * @param {HTMLElement} el
 * @param {string} classNames
 * @param {string} [msg]
 */
function doesNotHaveClass(el: HTMLElement, classNames: string, msg?: string) {
  _checkClass(el, classNames, false, msg);
}

/**
 * Helper function, to check if a given element
 * - is unique (if it is a jquery node set)
 * - is (or not) visible
 *
 * @private
 * @param {HTMLElement} el
 * @param {boolean} shouldBeVisible
 * @param {string} [msg]
 */
function _checkVisible(el: HTMLElement, shouldBeVisible: boolean, msg?: string): void {
  msg = msg || `target should ${shouldBeVisible ? "" : "not"} be visible`;
  let isVisible = el && el.offsetWidth && el.offsetHeight;
  if (isVisible) {
    // This computation is a little more heavy and we only want to perform it
    // if the above assertion has failed.
    const rect = el.getBoundingClientRect();
    isVisible = rect.width + rect.height;
  }
  const condition = shouldBeVisible ? isVisible : !isVisible;
  QUnit.assert.ok(condition, msg);
}

function isVisible(el: HTMLElement, msg?: string) {
  return _checkVisible(el, true, msg);
}
function isNotVisible(el: HTMLElement, msg?: string) {
  return _checkVisible(el, false, msg);
}

declare global {
  interface Assert {
    containsN: typeof containsN;
    containsNone: typeof containsNone;
    containsOnce: typeof containsOnce;
    doesNotHaveClass: typeof doesNotHaveClass;
    hasClass: typeof hasClass;
    isVisible: typeof isVisible;
    isNotVisible: typeof isNotVisible;
  }
}

QUnit.assert.containsN = containsN;
QUnit.assert.containsNone = containsNone;
QUnit.assert.containsOnce = containsOnce;
QUnit.assert.doesNotHaveClass = doesNotHaveClass;
QUnit.assert.hasClass = hasClass;
QUnit.assert.isVisible = isVisible;
QUnit.assert.isNotVisible = isNotVisible;

// -----------------------------------------------------------------------------
// QUnit debug
// -----------------------------------------------------------------------------

/**
 * For debug purposes, we add a "debug" function to the QUnit object. It has the
 * same API as "QUnit.test", but before executing the test (in only mode), it
 * sets a "debug" flag to true on QUnit.config. This flag can then be used in
 * helpers to change the default target to document.body or add extra logs.
 */

type TestCallback = (assert: Assert) => void | Promise<any>;
type QUnitTest = (name: string, callback: TestCallback) => void;

declare global {
  interface Config {
    debug: boolean;
  }
  interface QUnit {
    debug: QUnitTest;
  }
}

const QUnitCopy = QUnit as any; // to remove rollup warnings
QUnitCopy.debug = (name: string, cb: TestCallback) => {
  QUnit.config.debug = true;
  QUnit.only(name, cb);
};

// -----------------------------------------------------------------------------
// QUnit logs
// -----------------------------------------------------------------------------

/**
 * If we want to log several errors, we have to log all of them at once, as
 * browser_js is closed as soon as an error is logged.
 */
const errorMessages: string[] = [];

QUnit.done(async (result) => {
  if (result.failed) {
    errorMessages.push(`${result.failed} / ${result.total} tests failed.`);
  }
  if (!result.failed) {
    console.log("test successful");
  } else {
    console.error(errorMessages.join("\n"));
  }
});

/**
 * This logs various data in the console, which will be available in the log
 * .txt file generated by the runbot.
 */
QUnit.log((result) => {
  if (result.result) {
    return;
  }
  let info = '"QUnit test failed: "'; // + result.module + ' > ' + result.name + '"';
  info += ' [message: "' + result.message + '"';
  if (result.actual !== null) {
    info += ', actual: "' + result.actual + '"';
  }
  if (result.expected !== null) {
    info += ', expected: "' + result.expected + '"';
  }
  info += "]";
  errorMessages.push(info);
});
