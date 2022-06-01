/** @odoo-module **/
import { useBus } from "@web/core/utils/hooks";

const { useComponent, useEffect, useRef, useEnv } = owl;

/**
 * This hook is meant to be used by field components that use an input or
 * textarea to edit their value. Its purpose is to prevent that value from being
 * erased by an update of the model (typically coming from an onchange) when the
 * user is currently editing it.
 *
 * @param {() => string} getValue a function that returns the value to write in
 *   the input, if the user isn't currently editing it
 * @param {string} [refName="input"] the ref of the input/textarea
 */
export function useInputField(params) {
    const env = useEnv();
    const inputRef = useRef(params.refName || "input");
    const component = useComponent();
    let isDirty = false;
    let lastSetValue = null;
    function onInput(ev) {
        isDirty = ev.target.value !== lastSetValue;
    }
    function onChange(ev) {
        lastSetValue = ev.target.value;
        isDirty = false;
    }
    useBus(env.bus, "RELATIONAL_MODEL:WILL_SAVE_URGENTLY", () => commitChanges(true));
    useBus(env.bus, "RELATIONAL_MODEL:WILL_SAVE", () => commitChanges(false));
    useEffect(
        (inputEl) => {
            if (inputEl) {
                inputEl.addEventListener("input", onInput);
                inputEl.addEventListener("change", onChange);
                return () => {
                    inputEl.removeEventListener("input", onInput);
                    inputEl.removeEventListener("change", onChange);
                };
            }
        },
        () => [inputRef.el]
    );
    useEffect(() => {
        if (inputRef.el && !isDirty) {
            inputRef.el.value = params.getValue();
            lastSetValue = inputRef.el.value;
        }
    });

    async function commitChanges(urgent) {
        if (isDirty || urgent) {
            try {
                const val = params.parse ? params.parse(inputRef.el.value) : inputRef.el.value;
                if (val !== component.props.value) {
                    await component.props.update(val);
                }
            } catch (_e) {
                if (urgent) {
                    return;
                } else {
                    component.props.invalidate();
                }
            }
        }
    }
}
