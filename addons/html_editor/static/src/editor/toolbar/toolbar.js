import { Component, onMounted, useRef } from "@odoo/owl";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        onMounted: Function,
        dispatch: Function,
        getSelection: Function,
        close: Function,
        // TODO: more specific prop validation for buttons after its format has been defined.
        buttonGroups: Array,
        buttonsActiveState: Object,
    };

    setup() {
        const ref = useRef("root");
        onMounted(() => this.props.onMounted(ref.el));
    }

    dispatch(cmd, payload) {
        this.props.dispatch(cmd, payload);
    }
}
