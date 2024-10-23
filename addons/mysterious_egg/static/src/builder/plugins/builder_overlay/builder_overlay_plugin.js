import { Plugin } from "@html_editor/plugin";
import { BuilderOverlay } from "./builder_overlay";

export class BuilderOverlayPlugin extends Plugin {
    static name = "builder_overlay";
    static dependencies = ["selection", "overlay"];
    static resources = (p) => ({
        change_selected_toolboxes_listeners: p.openBuilderOverlay.bind(p),
    });

    setup() {
        this.overlay = this.shared.createOverlay(BuilderOverlay, {
            positionOptions: {
                position: "center",
            },
        });
    }

    openBuilderOverlay(toolboxes) {
        const toolbox = toolboxes[0];
        this.removeCurrentOverlay?.();
        if (!toolbox) {
            return;
        }
        this.removeCurrentOverlay = this.services.overlay.add(BuilderOverlay, {
            target: toolbox.element,
            container: this.document.documentElement,
        });
    }
}
