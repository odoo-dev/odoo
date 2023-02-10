/* @odoo-module */

import { makeContext } from "@web/core/context";
import { omit } from "@web/core/utils/objects";

export function addFieldDependencies(activeFields, fields, fieldDependencies = []) {
    for (const field of fieldDependencies) {
        if (!activeFields[field.name]) {
            activeFields[field.name] = {
                context: field.context || "{}",
                invisible: field.invisible || false,
                readonly: field.readonly || false,
                required: field.required || false,
                onChange: field.onChange || false,
            };
        }
        if (!fields[field.name]) {
            fields[field.name] = omit(field, [
                "context",
                "invisible",
                "required",
                "readonly",
                "onChange",
            ]);
        }
    }
}

export function createPropertyActiveField(property) {
    const { type } = property;

    const activeField = {
        context: "{}",
        invisible: false,
        readonly: false,
        required: false,
        onChange: false,
    };
    if (type === "many2many") {
        activeField.related = {
            fields: {
                id: { name: "id", type: "integer", readonly: true },
                display_name: { name: "display_name", type: "char" },
            },
            activeFields: {
                id: {
                    context: "{}",
                    invisible: false,
                    readonly: false,
                    required: false,
                    onChange: false,
                },
                display_name: {
                    context: "{}",
                    invisible: false,
                    readonly: false,
                    required: false,
                    onChange: false,
                },
            },
        };
    }
    return activeField;
}

export function extractFieldsFromArchInfo({ fieldNodes, widgetNodes }, fields) {
    const activeFields = {};
    fields = { ...fields };
    for (const fieldNode of Object.values(fieldNodes)) {
        const fieldName = fieldNode.name;
        const modifiers = fieldNode.modifiers || {};
        if (!(fieldName in activeFields)) {
            activeFields[fieldName] = {
                context: fieldNode.context || "{}",
                invisible: modifiers.invisible || modifiers.column_invisible || false,
                readonly: modifiers.readonly || false,
                required: modifiers.required || false,
                onChange: fieldNode.onChange || false,
            };
            if (modifiers.invisible === true || modifiers.column_invisible === true) {
                continue; // always invisible
            }
            if (fieldNode.views) {
                const viewDescr = fieldNode.views[fieldNode.viewMode];
                activeFields[fieldName].related = extractFieldsFromArchInfo(
                    viewDescr,
                    viewDescr.fields
                );
                activeFields[fieldName].limit = viewDescr.limit;
                activeFields[fieldName].defaultOrderBy = viewDescr.defaultOrder;
            }
        } else {
            // TODO (see task description for multiple occurrences of fields)
        }
        if (fieldNode.field) {
            let fieldDependencies = fieldNode.field.fieldDependencies;
            if (typeof fieldDependencies === "function") {
                fieldDependencies = fieldDependencies(fieldNode);
            }
            addFieldDependencies(activeFields, fields, fieldDependencies);
        }
    }
    for (const widgetInfo of Object.values(widgetNodes || {})) {
        let fieldDependencies = widgetInfo.widget.fieldDependencies;
        if (typeof fieldDependencies === "function") {
            fieldDependencies = fieldDependencies(widgetInfo);
        }
        addFieldDependencies(activeFields, fields, fieldDependencies);
    }
    return { activeFields, fields };
}

const SENTINEL = Symbol("sentinel");
export function getFieldContext(fieldName, activeFields, evalContext, parentActiveFields = null) {
    const rawContext = activeFields[fieldName].context;
    if (!rawContext || rawContext === "{}") {
        return;
    }

    evalContext = { ...evalContext };
    for (const fieldName in activeFields) {
        evalContext[fieldName] = SENTINEL;
    }
    if (parentActiveFields) {
        evalContext.parent = {};
        for (const fieldName in parentActiveFields) {
            evalContext.parent[fieldName] = SENTINEL;
        }
    }
    const evaluatedContext = makeContext([rawContext], evalContext);
    for (const key in evaluatedContext) {
        if (evaluatedContext[key] === SENTINEL || key.startsWith("default_")) {
            // FIXME: this isn't perfect, a value might be evaluted to something else
            // than the symbol because of the symbol
            delete evaluatedContext[key];
        }
    }
    if (Object.keys(evaluatedContext).length > 0) {
        return evaluatedContext;
    }
}

function _populateOnChangeSpec(activeFields, spec, path = false) {
    const prefix = path ? `${path}.` : "";
    for (const [fieldName, field] of Object.entries(activeFields)) {
        const key = `${prefix}${fieldName}`;
        spec[key] = field.onChange ? "1" : "";
        if (field.related) {
            _populateOnChangeSpec(field.related.activeFields, spec, key);
        }
    }
}
export const getOnChangeSpec = (activeFields) => {
    const spec = {};
    _populateOnChangeSpec(activeFields, spec);
    return spec;
};

let nextId = 0;
/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function getId(prefix = "") {
    return `${prefix}_${++nextId}`;
}
