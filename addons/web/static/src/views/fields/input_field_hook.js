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

    /*
     * A field is dirty if it is no longer sync with the model
     * More specifically, a field is no longer dirty after it has *tried* to update the value in the model.
     * An invalid value will thefore not be dirty even if the model will not actually store the invalid value.
     */
    let isDirty = false;

    /**
     * A field is invalid if the parsing of its value failed.
     */
    let isInvalid = false;

    /**
     * The last value that has been commited to the model.
     * Not changed in case of invalid field value.
     */
    let lastSetValue = null;

    /**
     * When a user types, we need to set the field as dirty.
     */
    function onInput(ev) {
        isDirty = ev.target.value !== lastSetValue;
        if (component.props.setDirty) {
            component.props.setDirty(isDirty);
        }
    }

    /**
     * On blur, we consider the field no longer dirty, even if it were to be invalid.
     * However, if the field is invalid, the new value will not be committed to the model.
     */
    function onChange(ev) {
        isDirty = false;
        isInvalid = false;
        let val = ev.target.value;
        if (params.parse) {
            try {
                val = params.parse(val);
            } catch (_e) {
                component.props.record.setInvalidField(component.props.name);
                isInvalid = true;
            }
        }

        if (!isInvalid) {
            component.props.update(val);
            lastSetValue = ev.target.value;
        }

        if (component.props.setDirty) {
            component.props.setDirty(isDirty);
        }
    }

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

    /**
     * Sometimes, a patch can happen with possible a new value for the field
     * If the user was typing a new value (isDirty) or had enter an invalid value (isInvalid),
     * we need to do nothing.
     * If it is not such a case, we update the field with the new value.
     */
    useEffect(() => {
        if (inputRef.el && !isDirty && !isInvalid) {
            inputRef.el.value = params.getValue();
            lastSetValue = inputRef.el.value;
        }
    });

    useBus(env.bus, "RELATIONAL_MODEL:WILL_SAVE_URGENTLY", () => commitChanges(true));
    useBus(env.bus, "RELATIONAL_MODEL:NEED_LOCAL_CHANGES", () => commitChanges(false));

    /**
     * Roughly the same as onChange, but called at more specific / critical times. (See bus events)
     */
    function commitChanges(urgent) {
        if (!inputRef.el) {
            return;
        }

        if (isInvalid && !isDirty) {
            return;
        }

        isDirty = inputRef.el.value !== lastSetValue;
        if (isDirty || urgent) {
            isInvalid = false;
            isDirty = false;
            let val = inputRef.el.value;
            if (params.parse) {
                try {
                    val = params.parse(val);
                } catch (_e) {
                    isInvalid = true;
                    if (urgent) {
                        return;
                    } else {
                        component.props.record.setInvalidField(component.props.name);
                    }
                }
            }

            if (component.props.setDirty) {
                component.props.setDirty(isDirty);
            }

            if (isInvalid) {
                return;
            }

            if (val !== component.props.value) {
                component.props.update(val);
                lastSetValue = inputRef.el.value;
            }
        }
    }
}
