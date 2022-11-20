/** @odoo-module */

import { onExternalClick, useFocus, useHover } from "../utils";
import { Component, useRef, useState, onWillUpdateProps, useEffect } from "@odoo/owl";

export class AutogrowInput extends Component {
    setup() {
        this.state = useState({
            value: this.props.value,
        });
        this.inputFocus = useFocus("input");
        this.inputRef = useRef("input");
        this.inputHover = useHover("input");
        onWillUpdateProps((nextProps) => {
            if (this.props.value !== nextProps.value) {
                this.state.value = nextProps.value;
            }
        });
        onExternalClick("input", () => this.onValidate());
        useEffect(
            () => {
                this.inputRef.el.style.width = "1px";
                this.inputRef.el.style.width = this.inputRef.el.scrollWidth + 5 + "px";
            },
            () => [this.state.value]
        );
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
        this.state.value = this.props.value;
    }
}

Object.assign(AutogrowInput, {
    template: "mail.autogrow_input",
    props: {
        className: { type: String, optional: true },
        disabled: { type: Boolean, optional: true },
        onValidate: { type: Function, optional: true },
        value: { type: String },
    },
    defaultProps: {
        className: "",
        onValidate: () => {},
    },
});
