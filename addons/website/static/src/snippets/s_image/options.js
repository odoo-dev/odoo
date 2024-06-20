/** @odoo-module **/

import { SnippetOption } from "@web_editor/js/editor/snippets.options";
import { MediaDialog } from "@web_editor/components/media_dialog/media_dialog";

export class ImageSnippet extends SnippetOption {

    constructor() {
        super(...arguments);
        this.dialog = this.env.services.dialog;
    }

    /**
     * @override
     */
    async onBuilt() {
        // When the placeholder has been dropped we directly open the media
        // dialog.
        await new Promise(resolve => {
            let isImageSaved = false;
            this.dialog.add(MediaDialog, {
                onlyImages: true,
                save: imageEl => {
                    isImageSaved = true;
                    // Replace the placeholder with the new image.
                    this.$target[0].parentNode.insertBefore(imageEl, this.$target[0]);
                    this.$target[0].parentNode.removeChild(this.$target[0]);
                },
            }, {
                onClose: () => {
                    if (!isImageSaved) {
                        // Revert the current step to exclude the step where the
                        // placeholder is added and then removed from the DOM
                        this.options.wysiwyg.odooEditor.historyRevertCurrentStep();
                        // If no image has been chosen, the placeholder is
                        // removed.
                        this.$target[0].remove();
                    }
                    resolve();
                }
            });
        });
    }
}

registry.category("snippet_options").add("Image", {
    Class: ImageSnippet,
    selector: '.s_image',
});
