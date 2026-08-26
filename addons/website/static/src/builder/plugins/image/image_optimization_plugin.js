import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { addDimensionsToImages } from "./image_optimization_utils";

export class ImageOptimizationPlugin extends Plugin {
    static id = "imageOptimization";

    /** @type {import("plugins").WebsiteResources} */
    resources = {
        on_editor_started_handlers: () => {
            for (const img of this.editable.querySelectorAll("img.img-fluid")) {
                if (
                    !img.classList.contains("img-optimized") &&
                    !img.closest("[data-oe-type='image']")
                ) {
                    img.closest(".o_savable")?.classList.add("o_dirty");
                }
            }
        },
        on_will_save_handlers: async (_, elements) => {
            await addDimensionsToImages(elements);
        },
    };
}

registry.category("website-plugins").add(ImageOptimizationPlugin.id, ImageOptimizationPlugin);
