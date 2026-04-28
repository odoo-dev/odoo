import { Component, onMounted, onWillDestroy } from "@odoo/owl";
import { useForwardRefToParent } from "@web/core/utils/hooks";
import { cookie } from "@web/core/browser/cookie";
import { useLayoutEffect } from "@web/owl2/utils";

export class IframeInput extends Component {
    static template = "web.IframeInput";
    static props = {
        // refs (DOM access)
        iframeRef: { type: Function, optional: true },
        inputRef: { type: Function, optional: true },

        // data / value
        value: { type: [String, Number] },
        inputAttrs: { type: Object, optional: true },

        // styling
        iframeClass: { type: String, optional: true },
        iframeStyle: { type: String, optional: true },
        inputStyle: { type: String, optional: true },

        // events (handlers)
        onBlur: { type: Function, optional: true },
        onChange: { type: Function, optional: true },
        onClick: { type: Function, optional: true },
        onFocus: { type: Function, optional: true },
        onInput: { type: Function, optional: true },
        onKeydown: { type: Function, optional: true },
    };

    setup() {
        this.iframeRef = useForwardRefToParent("iframeRef");

        onMounted(() => {
            const iframeEl = this.iframeRef.el;

            const initInput = () => {
                const iframeDoc = iframeEl.contentWindow.document;

                // Skip if already initialized or body is missing.
                if (this.input || !iframeDoc.body) {
                    return;
                }

                // Hide number input spin buttons.
                iframeDoc.head.insertAdjacentHTML(
                    "beforeend",
                    `<style>
                        input::-webkit-outer-spin-button,
                        input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
                        input[type="number"] { -moz-appearance: textfield; }
                    </style>`
                );

                this.input = iframeDoc.createElement("input");
                Object.assign(iframeDoc.body.style, {
                    padding: "0",
                    margin: "0",
                });
                const isDarkMode = cookie.get("color_scheme") === "dark";
                this.input.style.cssText = `
                    width: 100%;
                    height: 100%;
                    outline: none;
                    text-align: center;
                    background-color: ${isDarkMode ? "#262A36" : "#FFF"};
                    color: ${isDarkMode ? "#FFF" : "#000"};
                    ${this.props.inputStyle || ""}
                `;

                this.input.autocomplete = "off";
                for (const [key, val] of Object.entries(this.props.inputAttrs || {})) {
                    if (val === undefined || val === null) {
                        continue;
                    }
                    if (key in this.input) {
                        this.input[key] = val;
                    } else {
                        this.input.setAttribute(key, val);
                    }
                }
                this.input.value = this.props.value;

                iframeDoc.body.appendChild(this.input);
                this._bindInputEvents();
                this.props.inputRef?.({ el: this.input });
            };

            if (iframeEl.contentDocument.readyState === "complete") {
                initInput();
            }
            // If iframe is moved around in DOM, it restarts from scratch and needs to be repopulated.
            iframeEl.addEventListener("load", initInput);
        });

        onWillDestroy(() => {
            if (this.input && this._handlers) {
                for (const [event, handler] of Object.entries(this._handlers)) {
                    this.input.removeEventListener(event, handler);
                }
            }
            this.input = null;
        });

        useLayoutEffect(
            () => {
                if (this.input) {
                    // Update value whenever it changes.
                    this.input.value = this.props.value;
                }
            },
            () => [this.props.value]
        );
    }

    _bindInputEvents() {
        const handlers = {
            blur: this.props.onBlur,
            change: this.props.onChange,
            click: this.props.onClick,
            focus: this.props.onFocus,
            input: this.props.onInput,
            keydown: this.props.onKeydown,
        };
        this._handlers = {};
        for (const [event, handler] of Object.entries(handlers)) {
            if (!handler) {
                continue;
            }
            this._handlers[event] = handler;
            this.input.addEventListener(event, handler);
        }
    }
}
