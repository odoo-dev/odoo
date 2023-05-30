/* @odoo-module */

import { markup } from "@odoo/owl";
import { makeContext } from "@web/core/context";
import { deserializeDate, deserializeDateTime } from "@web/core/l10n/dates";
import { omit } from "@web/core/utils/objects";
import { orderByToString } from "@web/views/utils";

function makeActiveField({ context, invisible, readonly, required, onChange, forceSave } = {}) {
    return {
        context: context || "{}",
        invisible: invisible || false,
        readonly: readonly || false,
        required: required || false,
        onChange: onChange || false,
        forceSave: forceSave || false,
    };
}

const AGGREGATABLE_FIELD_TYPES = ["float", "integer", "monetary"]; // types that can be aggregated in grouped views

export function addFieldDependencies(activeFields, fields, fieldDependencies = []) {
    for (const field of fieldDependencies) {
        if (!activeFields[field.name]) {
            activeFields[field.name] = makeActiveField(field);
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

    const activeField = makeActiveField();
    if (type === "many2many") {
        activeField.related = {
            fields: {
                id: { name: "id", type: "integer", readonly: true },
                display_name: { name: "display_name", type: "char" },
            },
            activeFields: {
                id: makeActiveField(),
                display_name: makeActiveField(),
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
            activeFields[fieldName] = makeActiveField({
                context: fieldNode.context,
                invisible: modifiers.invisible || modifiers.column_invisible,
                readonly: modifiers.readonly,
                required: modifiers.required,
                onChange: fieldNode.onChange,
                forceSave: fieldNode.forceSave,
            });
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
            if (fieldNode.field?.useSubView) {
                activeFields[fieldName].required = false;
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

export function getFieldContext(
    record,
    fieldName,
    rawContext = record.activeFields[fieldName].context
) {
    const context = {};
    for (const key in record.context) {
        if (
            !key.startsWith("default_") &&
            !key.startsWith("search_default_") &&
            !key.endsWith("_view_ref")
        ) {
            context[key] = record.context[key];
        }
    }

    return {
        ...context,
        ...record.fields[fieldName].context,
        ...makeContext([rawContext], record.evalContext),
    };
}

const SENTINEL = Symbol("sentinel");
function _getFieldContextSpec(
    fieldName,
    activeFields,
    fields,
    evalContext,
    parentActiveFields = null
) {
    const rawContext = activeFields[fieldName].context;
    if (!rawContext || rawContext === "{}") {
        return fields[fieldName].context;
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
    const evaluatedContext = makeContext([fields[fieldName].context, rawContext], evalContext);
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
            const context = _getFieldContextSpec(
                fieldName,
                activeFields,
                fields,
                evalContext,
                parentActiveFields
            );
            if (context) {
                fieldsSpec[fieldName].context = context;
            }
        }
    }

    for (const fieldName of properties) {
        const fieldSpec = fieldsSpec[fields[fieldName].definition_record];
        if (fieldSpec) {
            if (!fieldSpec.fields) {
                fieldSpec.fields = {};
            }
            fieldSpec.fields.display_name = {};
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

/**
 * @protected
 * @param {Field | false} field
 * @param {any} value
 * @returns {any}
 */
export function parseServerValue(field, value) {
    switch (field.type) {
        case "char":
        case "text": {
            return value || "";
        }
        case "date": {
            return value ? deserializeDate(value) : false;
        }
        case "datetime": {
            return value ? deserializeDateTime(value) : false;
        }
        case "html": {
            return markup(value || "");
        }
        case "selection": {
            if (value === false) {
                // process selection: convert false to 0, if 0 is a valid key
                const hasKey0 = field.selection.find((option) => option[0] === 0);
                return hasKey0 ? 0 : value;
            }
            return value;
        }
        case "many2one": {
            if (Array.isArray(value)) {
                // for now, onchange still returns many2one values as pairs [id, display_name]
                return value;
            }
            if (Number.isInteger(value)) {
                // for always invisible many2ones, unity directly returns the id, not a pair
                // FIXME: should return an object with only the id
                return [value, ""];
            }
            return value ? [value.id, value.display_name] : false;
        }
        case "properties": {
            return value
                ? value.map((property) => ({
                      ...property,
                      value: parseServerValue(property, property.value ?? false),
                  }))
                : [];
        }
    }
    return value;
}

/**
 * @param {Object} groupData
 * @returns {Object}
 */
export function getAggregatesFromGroupData(groupData, fields) {
    const aggregates = {};
    for (const [key, value] of Object.entries(groupData)) {
        if (key in fields && AGGREGATABLE_FIELD_TYPES.includes(fields[key].type)) {
            aggregates[key] = value;
        }
    }
    return aggregates;
}

/**
 * @param {import("./datapoint").Field} field
 * @param {any} rawValue
 * @returns {string | false}
 */
export function getDisplayNameFromGroupData(field, rawValue) {
    if (field.type === "selection") {
        return Object.fromEntries(field.selection)[rawValue];
    }
    if (["many2one", "many2many"].includes(field.type)) {
        return rawValue ? rawValue[1] : false;
    }
    return rawValue;
}

/**
 * @param {Object} groupData
 * @param {import("./datapoint").Field} field
 * @param {any} rawValue
 * @returns {any}
 */
export function getValueFromGroupData(groupData, field, rawValue) {
    if (["date", "datetime"].includes(field.type)) {
        const range = groupData.range;
        if (!range) {
            return false;
        }
        const dateValue = parseServerValue(field, range.to);
        return dateValue.minus({
            [field.type === "date" ? "day" : "second"]: 1,
        });
    }
    const value = parseServerValue(field, rawValue);
    if (["many2one", "many2many"].includes(field.type)) {
        return value ? value[0] : false;
    }
    return value;
}
