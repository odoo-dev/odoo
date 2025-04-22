import { Component, useState } from "@odoo/owl";
import { ColorPicker } from "@web/core/color_picker/color_picker";
import { HighlightPicker } from "./highlight_picker";

export class HighlightConfigurator extends Component {
    static template = "website.highlightConfigurator";
    static components = { ColorPicker };

    setup() {
        this.state = useState({ color: 0, shape: 0, thickness: 0 });
    }

    openHighlightPicker() {
        this.props.componentStack.push(
            HighlightPicker,
            { selectHighlight: this.selectHighlight.bind(this) },
            "Select a highlight"
        );
    }

    selectHighlight(highlightId) {
        this.props.componentStack.pop();
        this.props.applyHighlight(highlightId);
    }
}
