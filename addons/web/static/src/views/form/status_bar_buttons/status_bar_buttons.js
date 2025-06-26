import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { CONTROL_PANEL_BUTTONS_DEFAULT_SEQUENCE } from "@web/search/control_panel/control_panel";

import { Component } from "@odoo/owl";

export class StatusBarButtons extends Component {
    static template = "web.StatusBarButtons";
    static components = {
        Dropdown,
        DropdownItem,
    };
    static props = {
        slots: { type: Object, optional: true },
        responsive: { type: Boolean, optional: true },
        staticButtons: { type: Array, optional: true },
        staticButtonsEvalContext: { type: Object, optional: true },
    };
    static defaultProps = {
        responsive: true,
    };

    get visibleSlotNames() {
        if (!this.props.slots) {
            return [];
        }
        return Object.entries(this.props.slots)
            .filter((entry) => entry[1].isVisible)
            .map((entry) => entry[0]);
    }

    get visibleStaticButtons() {
        return this.props.staticButtons || [];
        // console.debug(this.props.staticButtons, this.props.staticButtonsEvalContext);
        // if (!this.props.staticButtons) {
        //     return [];
        // }
        // return Object.entries(this.props.staticButtons)
        //     .map(([key, btn]) => ({
        //         id: key,
        //         ...btn,
        //     }))
        //     .filter((btn) =>
        //         btn.isAvailable ? btn.isAvailable.call(this.props.staticButtonsEvalContext) : true
        //     )
        //     .sort(
        //         (btn1, btn2) =>
        //             (btn1.sequence || CONTROL_PANEL_BUTTONS_DEFAULT_SEQUENCE) -
        //             (btn2.sequence || CONTROL_PANEL_BUTTONS_DEFAULT_SEQUENCE)
        //     );
    }
}
