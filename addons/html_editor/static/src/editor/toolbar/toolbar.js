/** @odoo-module */

import { Component, onMounted, useRef, useState, useExternalListener } from "@odoo/owl";

export class Toolbar extends Component {
    static template = "html_editor.Toolbar";
    static props = {
        onMounted: Function,
        dispatch: Function,
        close: Function,
        // TODO: more specific prop validation for buttons after its format has been defined.
        buttons: Array,
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
