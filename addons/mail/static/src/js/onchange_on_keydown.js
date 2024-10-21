import { useEffect } from "@odoo/owl";
import { patch } from "@web/core/utils/patch";
import { exprToBoolean } from "@web/core/utils/strings";
import { useDebounced } from "@web/core/utils/timing";
import { CharField } from "@web/views/fields/char/char_field";
import { TextField } from "@web/views/fields/text/text_field";

/**
 * Support a key-based onchange in text fields.
 * The triggerOnChange method is debounced to run after given debounce delay
 * (or 2 seconds by default) when typing ends.
 */
const patchFieldClass = (Class) => {
    patch(Class.prototype, {
        setup() {
            super.setup(...arguments);
            if (this.props.onchangeOnKeydown) {
                const input = this.input || this.textareaRef;

                const triggerOnChange = useDebounced(
                    this.triggerOnChange,
                    this.props.keydownDebounceDelay
                );
                useEffect(() => {
                    if (input.el) {
                        input.el.addEventListener("keydown", triggerOnChange);
                        return () => {
                            input.el.removeEventListener("keydown", triggerOnChange);
                        };
                    }
                });
            }
        },
        triggerOnChange() {
            const input = this.input || this.textareaRef;
            input.el.dispatchEvent(new Event("change"));
        },
    });
    patch(Class.props, {
        onchangeOnKeydown: { type: Boolean, optional: true },
        keydownDebounceDelay: { type: Number, optional: true },
    });
    patch(Class, {
        extractProps(fieldInfo) {
            return {
                ...super.extractProps(fieldInfo),
                onchangeOnKeydown: exprToBoolean(fieldInfo.attrs.onchange_on_keydown),
                keydownDebounceDelay: fieldInfo.attrs.keydown_debounce_delay
                    ? Number(fieldInfo.attrs.keydown_debounce_delay)
                    : 2000,
            };
        },
    });
};

patchFieldClass(CharField);
patchFieldClass(TextField);
