odoo.define('web_editor.utils', function (require) {
'use strict';

const {ColorpickerWidget} = require('web.Colorpicker');

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
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
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
    const numValue = parseFloat(m[0]);
    const valueUnit = m[1];
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
    const m = value.trim().match(/^(-?[0-9.]+)([A-Za-z% -]*)$/);
    if (!m) {
        return null;
    }
    return [m[1].trim(), m[2].trim()];
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
    // If not colors, they will be left untouched
    value1 = ColorpickerWidget.normalizeCSSColor(value1);
    value2 = ColorpickerWidget.normalizeCSSColor(value2);

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
/**
 * @param {string|number} name
 * @returns {boolean}
 */
function _isColorCombinationName(name) {
    const number = parseInt(name);
    return (!isNaN(number) && number % 100 !== 0);
}
/**
 * @param {string[]} colorNames
 * @param {string} [prefix='bg-']
 * @returns {string[]}
 */
function _computeColorClasses(colorNames, prefix = 'bg-') {
    let hasCCClasses = false;
    const isBgPrefix = (prefix === 'bg-');
    const classes = colorNames.map(c => {
        if (isBgPrefix && _isColorCombinationName(c)) {
            hasCCClasses = true;
            return `o_cc${c}`;
        }
        return (prefix + c);
    });
    if (hasCCClasses) {
        classes.push('o_cc');
    }
    return classes;
}
/**
 * Normalize a color in case it is a variable name so it can be used outside of
 * css.
 *
 * @param {string} color the color to normalize into a css value
 * @returns {string} the normalized color
 */
function normalizeColor(color) {
    if (!ColorpickerWidget.isCSSColor(color)) {
        const style = window.getComputedStyle(document.documentElement);
        color = style.getPropertyValue('--' + color).trim();
        color = ColorpickerWidget.normalizeCSSColor(color);
    }
    return color;
}
/**
 * Parse a background-image's src.
 *
 * @param {string} string a css value in the form 'url("...")'
 * @returns {string|false} the src of the image or false if not parsable
 */
function parseBgSrc(string) {
    const match = string.match(/^url\(['"](.*?)['"]\)$/);
    if (!match) {
        return '';
    }
    return match[1];
}

const getBgImageSrc = el => {
    return parseBgSrc($(el).css('background-image'));
};

return {
    CSS_SHORTHANDS: CSS_SHORTHANDS,
    CSS_UNITS_CONVERSION: CSS_UNITS_CONVERSION,
    computePxByRem: _computePxByRem,
    convertValueToUnit: _convertValueToUnit,
    convertNumericToUnit: _convertNumericToUnit,
    getNumericAndUnit: _getNumericAndUnit,
    areCssValuesEqual: _areCssValuesEqual,
    isColorCombinationName: _isColorCombinationName,
    computeColorClasses: _computeColorClasses,
    normalizeColor,
    getBgImageSrc,
};
});
