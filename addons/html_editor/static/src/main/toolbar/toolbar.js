import { Component, useState } from "@odoo/owl";
import { useOverlay } from "@html_editor/core/overlay_plugin";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        floating: { type: Boolean, optional: true },
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
        if (this.props.floating) {
            this.overlay = useOverlay("root", { position: "top" });
        }
    }

    dispatch(cmd, payload) {
        this.props.toolbar.dispatch(cmd, payload);
    }
}
