odoo.define('web_editor.utils', function (require) {
'use strict';

/**
 * window.getComputedStyle cannot work properly with CSS shortcuts (like
 * 'border-width' which is a shortcut for the top + right + bottom + left border
 * widths. If an option wants to customize such a shortcut, it should be listed
 * here with the non-shortcuts property it stands for, in order.
 *
 * @type {Object<string[]>}
 */
const CSS_SHORTHANDS = {
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'],
};
/**
 * Key-value mapping to list converters from an unit A to an unit B.
 * - The key is a string in the format '$1-$2' where $1 is the CSS symbol of
 *   unit A and $2 is the CSS symbol of unit B.
 * - The value is a function that converts the received value (expressed in
 *   unit A) to another value expressed in unit B. Two other parameters is
 *   received: the css property on which the unit applies and the jQuery element
 *   on which that css property may change.
 */
const CSS_UNITS_CONVERSION = {
    's-ms': () => 1000,
    'ms-s': () => 0.001,
    'rem-px': () => _computePxByRem(),
    'px-rem': () => _computePxByRem(true),
};

/**
 * Computes the number of "px" needed to make a "rem" unit. Subsequent calls
 * returns the cached computed value.
 *
 * @param {boolean} [toRem=false]
 * @returns {float} - number of px by rem if 'toRem' is false
 *                  - the inverse otherwise
 */
function _computePxByRem(toRem) {
    if (_computePxByRem.PX_BY_REM === undefined) {
        const htmlStyle = window.getComputedStyle(document.documentElement);
        _computePxByRem.PX_BY_REM = parseFloat(htmlStyle['font-size']);
    }
    return toRem ? (1 / _computePxByRem.PX_BY_REM) : _computePxByRem.PX_BY_REM;
}
/**
 * Converts the given (value + unit) string to a numeric value expressed in
 * the other given css unit.
 *
 * e.g. fct('400ms', 's') -> 0.4
 *
 * @param {string} value
 * @param {string} unitTo
 * @param {string} [cssProp] - the css property on which the unit applies
 * @param {jQuery} [$target] - the jQuery element on which that css property
 *                             may change
 * @returns {number}
 */
function _convertValueToUnit(value, unitTo, cssProp, $target) {
    const m = _getNumericAndUnit(value);
    if (!m) {
        return NaN;
    }
    const numValue = parseFloat(m[1]);
    const valueUnit = m[2];
    return _convertNumericToUnit(numValue, valueUnit, unitTo, cssProp, $target);
}
/**
 * Converts the given numeric value expressed in the given css unit into
 * the corresponding numeric value expressed in the other given css unit.
 *
 * e.g. fct(400, 'ms', 's') -> 0.4
 *
 * @param {number} value
 * @param {string} unitFrom
 * @param {string} unitTo
 * @param {string} [cssProp] - the css property on which the unit applies
 * @param {jQuery} [$target] - the jQuery element on which that css property
 *                             may change
 * @returns {number}
 */
function _convertNumericToUnit(value, unitFrom, unitTo, cssProp, $target) {
    if (Math.abs(value) < Number.EPSILON || unitFrom === unitTo) {
        return value;
    }
    const converter = CSS_UNITS_CONVERSION[`${unitFrom}-${unitTo}`];
    if (converter === undefined) {
        throw new Error(`Cannot convert '${unitFrom}' units into '${unitTo}' units !`);
    }
    return value * converter(cssProp, $target);
}
/**
 * Returns the numeric value and unit of a css value.
 *
 * e.g. fct('400ms') -> [400, 'ms']
 *
 * @param {string} value
 * @returns {Array|null}
 */
function _getNumericAndUnit(value) {
    return value.trim().match(/^([0-9.]+)(\w*)$/);
}
/**
 * Checks if two css values are equal.
 *
 * @param {string} value1
 * @param {string} value2
 * @param {string} [cssProp] - the css property on which the unit applies
 * @param {jQuery} [$target] - the jQuery element on which that css property
 *                             may change
 * @returns {boolean}
 */
function _areCssValuesEqual(value1, value2, cssProp, $target) {
    // String comparison first
    if (value1 === value2) {
        return true;
    }

    // Convert the second value in the unit of the first one and compare
    // floating values
    const data = _getNumericAndUnit(value1);
    if (!data) {
        return false;
    }
    const numValue1 = data[0];
    const numValue2 = _convertValueToUnit(value2, data[1], cssProp, $target);
    return (Math.abs(numValue1 - numValue2) < Number.EPSILON);
}

return {
    CSS_SHORTHANDS: CSS_SHORTHANDS,
    CSS_UNITS_CONVERSION: CSS_UNITS_CONVERSION,
    computePxByRem: _computePxByRem,
    convertValueToUnit: _convertValueToUnit,
    convertNumericToUnit: _convertNumericToUnit,
    getNumericAndUnit: _getNumericAndUnit,
    areCssValuesEqual: _areCssValuesEqual,
};
});
