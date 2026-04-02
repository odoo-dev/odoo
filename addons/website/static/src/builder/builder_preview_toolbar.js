import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";

export class BuilderPreviewToolbar extends Component {
    static template = "website.BuilderPreviewToolbar";
    static props = {
        onExitBuilderPreview: { type: Function },
        onToggleMobileView: { type: Function, optional: true },
        isMobileView: { type: Boolean },
    };
}

registry.category("lazy_components").add("website.BuilderPreviewToolbar", BuilderPreviewToolbar);
