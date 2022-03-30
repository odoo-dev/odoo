/** @odoo-module */

import { isAttr } from "../../core/utils/xml";

export const X2M_TYPES = ["one2many", "many2many"];
const RELATIONAL_TYPES = [...X2M_TYPES, "many2one"];

/**
 * @param {any} field
 * @returns {boolean}
 */
export const isRelational = (field) => field && RELATIONAL_TYPES.includes(field.type);

/**
 * @param {any} field
 * @returns {boolean}
 */
export const isX2Many = (field) => field && X2M_TYPES.includes(field.type);

/**
 * @param {string | string[]} [mode]
 * @returns {string[]}
 */
export const getX2MViewModes = (mode) => {
    if (!mode) {
        return ["list"];
    }
    const modes = Array.isArray(mode) ? mode : mode.split(",");
    return modes.map((m) => (m === "tree" ? "list" : m));
};

/**
 * @param {number | number[]} idsList
 * @returns {number[]}
 */
export const getIds = (idsList) => {
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
};

export function processButton(node) {
    return {
        classes: (node.getAttribute("class") || "").split(" "),
        icon: node.getAttribute("icon") || false,
        title: node.getAttribute("title") || undefined,
        string: node.getAttribute("string") || undefined,
        optionsAttribute: node.getAttribute("options") || "{}",
        modifiersAttribute: node.getAttribute("modifiers") || "{}",
        clickParams: {
            context: node.getAttribute("context") || "{}",
            name: node.getAttribute("name"),
            type: node.getAttribute("type"),
        },
    };
}

export function getActiveActions(rootNode) {
    return {
        edit: isAttr(rootNode, "edit").truthy(true),
        create: isAttr(rootNode, "create").truthy(true),
        delete: isAttr(rootNode, "delete").truthy(true),
        duplicate: isAttr(rootNode, "duplicate").truthy(true),
    };
}
