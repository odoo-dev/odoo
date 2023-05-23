/* @odoo-module */

import { makeContext } from "@web/core/context";
import { omit } from "@web/core/utils/objects";
import { orderByToString } from "@web/views/utils";

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

export function getFieldsSpec(activeFields, fields, evalContext, parentActiveFields = null) {
    console.log("getFieldsSpec");
    const fieldsSpec = {};
    const properties = [];
    for (const fieldName in activeFields) {
        if (fields[fieldName].relatedPropertyField) {
            continue;
        }
        const { related, limit, defaultOrderBy, invisible } = activeFields[fieldName];
        fieldsSpec[fieldName] = {};
        // X2M
        if (related) {
            fieldsSpec[fieldName].fields = getFieldsSpec(
                related.activeFields,
                related.fields,
                evalContext,
                activeFields
            );
            fieldsSpec[fieldName].limit = limit;
            if (defaultOrderBy) {
                fieldsSpec[fieldName].order = orderByToString(defaultOrderBy);
            }
        }
        // Properties
        if (fields[fieldName].type === "properties") {
            properties.push(fieldName);
        }
        // M2O
        if (fields[fieldName].type === "many2one" && invisible !== true) {
            fieldsSpec[fieldName].fields = { display_name: {} };
        }
        if (["many2one", "one2many", "many2many"].includes(fields[fieldName].type)) {
            const context = getFieldContext(
                fieldName,
                activeFields,
                evalContext,
                parentActiveFields
            );
            if (context) {
                fieldsSpec[fieldName].context = context;
            }
        }
    }

    for (const fieldName of properties) {
        if (fieldsSpec[fields[fieldName].definition_record]) {
            fieldsSpec[fields[fieldName].definition_record].fields.display_name = {};
        }
    }
    return fieldsSpec;
}

let nextId = 0;
/**
 * @param {string} [prefix]
 * @returns {string}
 */
export function getId(prefix = "") {
    return `${prefix}_${++nextId}`;
}
