import { Component, onMounted, useRef, useState } from "@odoo/owl";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        // overlay props
        onMounted: { type: Function, optional: true },
        close: { type: Function, optional: true },
        floating: { type: Boolean, optional: true },
        // toolbar props
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
        const ref = useRef("root");
        this.buttonsActiveState = useState(this.props.toolbar.buttonsActiveState);
        if (this.props.floating) {
            onMounted(() => {
                this.props.onMounted(ref.el);
            });
        }
    }

    dispatch(cmd, payload) {
        this.props.toolbar.dispatch(cmd, payload);
    }
}
