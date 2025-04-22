import { onMounted, useRef, Component } from "@odoo/owl";
import { applyTextHighlight, textHighlightFactory } from "@html_builder/utils/highlight_utils";

export class HighlightPicker extends Component {
    static template = "website.highlightPicker";

    setup() {
        const root = useRef("root");
        onMounted(() => {
            for (const textEl of root.el.querySelectorAll("[data-highlight-text]")) {
                applyTextHighlight(textEl, textEl.dataset.highlightText);
            }
        });
    }
    getHighlightFactory() {
        return textHighlightFactory;
    }
    onHighlightClick(highlightId) {
        this.props.selectHighlight(highlightId);
    }
}
