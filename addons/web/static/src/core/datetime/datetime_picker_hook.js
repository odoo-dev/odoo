import { useService } from "@web/core/utils/hooks";
import { useRef } from "@web/owl2/utils";

/**
 * @param {import("./datetimepicker_service").DateTimePickerServiceParams} params
 *  Note: `params.target` may be either a `t-ref` name (legacy string) or an
 *  Owl 3 signal ref (a callable returning the target element). Both shapes
 *  are forwarded as-is to the `datetime_picker` service.
 */
export function useDateTimePicker(params) {
    function getInputs() {
        return inputRefs.map((ref) => ref.el);
    }

    const inputRefs = [useRef("start-date"), useRef("end-date")];

    return useService("datetime_picker").create(
        // Need original object since 'pickerProps' (or any other param) can be defined
        // as getters
        Object.assign(Object.create(params), { getInputs }),
        { useOwlHooks: true }
    );
}
