import { useForwardRefToParent } from "@web/core/utils/hooks";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { hasTouch } from "@web/core/browser/feature_detection";

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
        inputLinks: { type: Array, optional: true },
        placeholder: { type: String, optional: true },
        required: { type: Boolean, optional: true },
        type: { type: String, optional: true },
    };

    setup() {
        this.inputRef = useForwardRefToParent("input");
    }

    get displayOverlayButton() {
        return hasTouch(); //FIXME or maybe isSmall only?
    }

    get buttonClass() {
        return `o_input_box_overlay suffix btn ${hasTouch() ? "btn-secondary" : "btn-link ms-1"}`;
    }
}
