import { Component, useState } from "@odoo/owl";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        class: { type: String, optional: true },
        toolbar: {
            type: Object,
            shape: {
                dispatch: Function,
                getSelection: Function,
                // TODO: more specific prop validation for buttons after its format has been defined.
                buttonGroups: Array,
                buttonsActiveState: Object,
            },
        },
    };

    setup() {
        this.buttonsActiveState = useState(this.props.toolbar.buttonsActiveState);
    }

    dispatch(cmd, payload) {
        this.props.toolbar.dispatch(cmd, payload);
    }
}
