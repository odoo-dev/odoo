import * as QUnit from "qunit";

// -----------------------------------------------------------------------------
// QUnit config
// -----------------------------------------------------------------------------

QUnit.config.autostart = false;

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

declare global {
  interface Assert {
    containsN: typeof containsN;
    containsNone: typeof containsNone;
    containsOnce: typeof containsOnce;
    doesNotHaveClass: typeof doesNotHaveClass;
    hasClass: typeof hasClass;
  }
}

QUnit.assert.containsN = containsN;
QUnit.assert.containsNone = containsNone;
QUnit.assert.containsOnce = containsOnce;
QUnit.assert.doesNotHaveClass = doesNotHaveClass;
QUnit.assert.hasClass = hasClass;
