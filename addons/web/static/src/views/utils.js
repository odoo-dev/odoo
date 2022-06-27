/** @odoo-module */

import { Domain } from "@web/core/domain";
import { _t } from "@web/core/l10n/translation";

export const X2M_TYPES = ["one2many", "many2many"];
const RELATIONAL_TYPES = [...X2M_TYPES, "many2one"];
const NUMERIC_TYPES = ["integer", "float", "monetary"];

/**
 * Parse the arch to check if is true or false
 * If the string is empty, 0, False or false it's considered as false
 * The rest is considered as true
 *
 * @param {string} str
 * @param {boolean} [trueIfEmpty=false]
 * @returns {boolean}
 */
export function archParseBoolean(str, trueIfEmpty = false) {
    return str ? !/^false|0$/i.test(str) : trueIfEmpty;
}

/**
 * TODO: doc
 *
 * @param {Object} fields
 * @param {Object} fieldAttrs
 * @param {string[]} activeMeasures
 * @param {string[]} [additionalMeasures=[]]
 * @returns {Object}
 */
export const computeReportMeasures = (
    fields,
    fieldAttrs,
    activeMeasures,
    additionalMeasures = []
) => {
    const measures = {
        __count: { name: "__count", string: _t("Count"), type: "integer" },
    };
    for (const [fieldName, field] of Object.entries(fields)) {
        if (fieldName === "id" || !field.store) {
            continue;
        }
        const { isInvisible } = fieldAttrs[fieldName] || {};
        if (isInvisible && !additionalMeasures.includes(fieldName)) {
            continue;
        }
        if (
            ["integer", "float", "monetary"].includes(field.type) ||
            additionalMeasures.includes(fieldName)
        ) {
            measures[fieldName] = field;
        }
    }

    // add active measures to the measure list.  This is very rarely
    // necessary, but it can be useful if one is working with a
    // functional field non stored, but in a model with an overridden
    // read_group method.  In this case, the pivot view could work, and
    // the measure should be allowed.  However, be careful if you define
    // a measure in your pivot view: non stored functional fields will
    // probably not work (their aggregate will always be 0).
    for (const measure of activeMeasures) {
        if (!measures[measure]) {
            measures[measure] = fields[measure];
        }
    }

    for (const fieldName in fieldAttrs) {
        if (fieldAttrs[fieldName].string && fieldName in measures) {
            measures[fieldName].string = fieldAttrs[fieldName].string;
        }
    }

    const sortedMeasures = Object.entries(measures).sort(([m1, f1], [m2, f2]) => {
        if (m1 === "__count" || m2 === "__count") {
            return m1 === "__count" ? 1 : -1; // Count is always last
        }
        return f1.string.toLowerCase().localeCompare(f2.string.toLowerCase());
    });

    return Object.fromEntries(sortedMeasures);
};

/**
 * @param {Array[] | boolean} modifier
 * @param {Object} evalContext
 * @returns {boolean}
 */
export function evalDomain(modifier, evalContext) {
    if (Array.isArray(modifier)) {
        modifier = new Domain(modifier).contains(evalContext);
    }
    return Boolean(modifier);
}

export function getActiveActions(rootNode) {
    return {
        edit: archParseBoolean(rootNode.getAttribute("edit"), true),
        create: archParseBoolean(rootNode.getAttribute("create"), true),
        delete: archParseBoolean(rootNode.getAttribute("delete"), true),
        duplicate: archParseBoolean(rootNode.getAttribute("duplicate"), true),
    };
}

export function getDecoration(rootNode) {
    const decorations = [];
    for (const name of rootNode.getAttributeNames()) {
        if (name.startsWith("decoration-")) {
            decorations.push({
                class: name.replace("decoration", "text"),
                condition: rootNode.getAttribute(name),
            });
        }
    }
    return decorations;
}

/**
 * @param {number | number[]} idsList
 * @returns {number[]}
 */
export function getIds(idsList) {
    if (Array.isArray(idsList)) {
        if (idsList.length === 2 && typeof idsList[1] === "string") {
            return [idsList[0]];
        } else {
            return idsList;
        }
    } else if (idsList) {
        return [idsList];
    } else {
        return [];
    }
}

/**
 * @param {any} field
 * @returns {boolean}
 */
export function isRelational(field) {
    return field && RELATIONAL_TYPES.includes(field.type);
}

/**
 * @param {any} field
 * @returns {boolean}
 */
export function isX2Many(field) {
    return field && X2M_TYPES.includes(field.type);
}

/**
 * @param {Object} field
 * @returns {boolean} true iff the given field is a numeric field
 */
export function isNumeric(field) {
    return NUMERIC_TYPES.includes(field.type);
}

export function processButton(node) {
    return {
        className: node.getAttribute("class") || "",
        icon: node.getAttribute("icon") || false,
        title: node.getAttribute("title") || undefined,
        string: node.getAttribute("string") || undefined,
        options: JSON.parse(node.getAttribute("options") || "{}"),
        modifiers: JSON.parse(node.getAttribute("modifiers") || "{}"),
        clickParams: {
            context: node.getAttribute("context") || "{}",
            name: node.getAttribute("name"),
            type: node.getAttribute("type"),
        },
    };
}

/**
 * In the preview implementation of reporting views, the virtual field used to
 * display the number of records was named __count__, whereas __count is
 * actually the one used in xml. So basically, activating a filter specifying
 * __count as measures crashed. Unfortunately, as __count__ was used in the JS,
 * all filters saved as favorite at that time were saved with __count__, and
 * not __count. So in order the make them still work with the new
 * implementation, we handle both __count__ and __count.
 *
 * This function replaces occurences of '__count__' by '__count' in the given
 * element(s).
 *
 * @param {any | any[]} [measures]
 * @returns {any}
 */
export function processMeasure(measure) {
    if (Array.isArray(measure)) {
        return measure.map(processMeasure);
    }
    return measure === "__count__" ? "__count" : measure;
}
