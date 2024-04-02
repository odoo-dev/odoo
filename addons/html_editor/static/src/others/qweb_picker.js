import { Component, useState } from "@odoo/owl";
import { useOverlay } from "@html_editor/core/overlay_plugin";

export class QWebPicker extends Component {
    static template = "html_editor.QWebPicker";
    static props = ["getGroups", "select"];

    setup() {
        useOverlay("root", { position: "top" });
        this.state = useState({ groups: this.props.getGroups() });
    }

    onChange(ev) {
        const [groupIndex, elementIndex] = ev.target.value.split(",");
        this.props.select(this.state.groups[groupIndex][elementIndex].node);
    }
}
