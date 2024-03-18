import { Component } from "@odoo/owl";
import { useOverlay } from "../core/overlay_plugin";

export class TableMenu extends Component {
    static template = "html_editor.TableMenu";
    static props = {
        position: String,
        dispatch: Function,
    };

    setup() {
        useOverlay("root", this.props.position);
    }
}
