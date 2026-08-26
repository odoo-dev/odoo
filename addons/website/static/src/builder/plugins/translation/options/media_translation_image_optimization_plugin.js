import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";
import { translateImageOptionSelector } from "./media_translation_plugin";
import { addDimensionsToImages } from "../../image/image_optimization_utils";

export class MediaTranslationImageOptimizationPlugin extends Plugin {
    static id = "mediaTranslationImageOptimization";

    /** @type {import("plugins").WebsiteResources} */
    resources = {
        on_editor_started_handlers: () => {
            for (const img of this.editable.querySelectorAll(translateImageOptionSelector)) {
                img.closest(".o_savable")?.classList.add("o_dirty");
            }
        },
        on_will_save_handlers: async (_, elements) => {
            await addDimensionsToImages(elements);
        },
    };
}

registry
    .category("translation-plugins")
    .add(MediaTranslationImageOptimizationPlugin.id, MediaTranslationImageOptimizationPlugin);
