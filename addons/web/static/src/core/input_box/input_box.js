import { useForwardRefToParent } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { hasTouch } from "@web/core/browser/feature_detection";
import { browser } from "@web/core/browser/browser";

import { Component } from "@odoo/owl";

export class InputBox extends Component {
    static template = "web.InputBox";
    static components = { Dropdown, DropdownItem };
    static defaultProps = {
        type: "text",
    };
    static props = {
        id: { type: String, optional: true },
        input: { type: Function, optional: true },
        overlayButtons: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        required: { type: Boolean, optional: true },
        type: { type: String, optional: true },
    };

    setup() {
        this.inputRef = useForwardRefToParent("input");
        this.hasTouch = hasTouch();
    }

    get overlayButtons() {
        if (this.props.overlayButtons) {
            return this.props.overlayButtons.map((btn) => ({
                ...btn,
                onSelected: btn.onSelected || (() => browser.open(btn.href))
            }));
        }
        return [];
    }

    get buttonClass() {
        return "o_input_box_overlay suffix btn btn-link";
    }
}
