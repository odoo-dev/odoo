import { fieldVisualFeedback } from "@web/views/fields/field";

function isEmptyValue(value) {
    if (value === false || value === null || value === undefined || value === "") {
        return true;
    }
    if (Array.isArray(value)) {
        return value.length === 0;
    }
    return Array.isArray(value?.records) && value.records.length === 0;
}

/**
 * Whether a form field (and its label) is dimmed by focus mode.
 *
 * @param {import("../services/learning_focus_plugin").LearningFocusPlugin} focus
 * @param {{record: Object, name: string, fieldInfo?: Object}} field
 */
export function isFieldDimmed(focus, { record, name, fieldInfo }) {
    if (!focus.isEnabled() || fieldInfo?.viewType !== "form") {
        return false;
    }
    const { required, invalid } = fieldVisualFeedback(fieldInfo.field, record, name, fieldInfo);
    const empty = record.fields[name].type !== "boolean" && isEmptyValue(record.data[name]);
    return !focus.isInFocus(record, { name, required, empty, invalid });
}
