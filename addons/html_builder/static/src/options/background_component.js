import { Component } from "@odoo/owl";
import { defaultBuilderComponents } from "../builder_components/default_builder_components";
import { getBgImageURLFromEl } from "@html_builder/utils/utils_css";
import { BackgroundShapeComponent } from "@html_builder/components/background_shape_component";

export class BackgroundComponent extends Component {
    static template = "html_builder.BackgroundComponent";
    static components = { ...defaultBuilderComponents };
    static props = {
        withColors: { type: Boolean },
        withImages: { type: Boolean },
        withColorCombinations: { type: Boolean },
        withGradient: { type: Boolean },
        withShapes: { type: Boolean, optional: true },
    };
    static defaultProps = {
        withShapes: false,
    };
    showWebShapeColorpicker() {
        // TODO: double check the getBgImageURLFromEl(editingEl)
        const editingEl = this.env.getEditingElement();
        const src = new URL(getBgImageURLFromEl(editingEl), window.location.origin);
        return (
            src.origin === window.location.origin &&
            (src.pathname.startsWith("/html_editor/shape/") ||
                src.pathname.startsWith("/web_editor/shape/"))
        );
    }
    onClick() {
        this.env.showComponent(BackgroundShapeComponent);
    }
}
