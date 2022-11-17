/** @odoo-module */

import { onExternalClick, useFocus, useHover } from "../utils";
import { Component, useRef, useState, onWillUpdateProps } from "@odoo/owl";

export class AutogrowInput extends Component {
    setup() {
        this.state = useState({
            value: this.props.value,
        });
        this.inputFocus = useFocus("input");
        this.inputRef = useRef("input");
        this.rootHover = useHover("root");
        onWillUpdateProps((nextProps) => {
            if (this.props.value !== nextProps.value) {
                this.state.value = nextProps.value;
            }
        });
        onExternalClick("input", () => this.onValidate());
    }

    /**
     * @param {KeyboardEvent} ev
     */
    onKeydownInput(ev) {
        switch (ev.key) {
            case "Enter":
                this.onValidate();
                this.inputRef.el.blur();
                break;
            case "Escape":
                this.onDiscard();
                this.inputRef.el.blur();
                break;
        }
    }

    onValidate() {
        this.props.onValidate({
            value: this.state.value,
        });
        this.state.value = this.props.value;
    }

    onDiscard() {
        this.props.onDiscard({
            value: this.state.value,
        });
        this.state.value = this.props.value;
    }
}

Object.assign(AutogrowInput, {
    template: "mail.autogrow_input",
    props: {
        class: {
            type: Object,
            blur: { type: String, optional: true },
            focus: { type: String, optional: true },
            general: { type: String, optional: true },
            hover: { type: String, optional: true },
            optional: true,
        },
        disabled: { type: Boolean, optional: true },
        onDiscard: { type: Function, optional: true },
        onValidate: { type: Function, optional: true },
        placeholder: { type: String, optional: true },
        title: { type: String, optional: true },
        value: { type: String },
    },
    defaultProps: {
        onValidate: () => {},
        onDiscard: () => {},
        class: {
            blur: "",
            focus: "",
            general: "bg-white border",
            hover: "",
        },
        placeholder: "",
    },
});
