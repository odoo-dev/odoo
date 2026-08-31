import { DateTimePickerManager } from "./datetimepicker_service";

/**
 * @param {import("./datetimepicker_service").DateTimePickerServiceParamsSchema} params
 */
export function useDateTimePicker(params) {
    function getInputs() {
        return inputRefs.map((ref) => ref());
    }

    // Callers driving the picker from a `target` only (no date inputs) omit
    // `inputRefs`.
    const inputRefs = params.inputRefs ?? [];

    return new DateTimePickerManager(
        // Need original object since 'pickerProps' (or any other param) can be defined
        // as getters
        Object.assign(Object.create(params), { getInputs })
    );
}
