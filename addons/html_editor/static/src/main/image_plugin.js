import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { _t } from "@web/core/l10n/translation";
import { isImageUrl } from "@html_editor/utils/url";

export class ImagePlugin extends Plugin {
    static name = "image";
    static dependencies = ["history", "link", "powerbox", "dom"];
    /** @type { (p: ImagePlugin) => Record<string, any> } */
    static resources(p) {
        return {
            handle_paste_url: p.handlePasteUrl.bind(p),
    setup() {
        this.addDomListener(this.editable, "mouseup", (e) => {
            if (e.target.tagName === "IMG") {
                const range = this.document.createRange();
                range.selectNode(e.target);
                this.shared.setSelection({
                    anchorNode: range.startContainer,
                    anchorOffset: range.startOffset,
                    focusNode: range.endContainer,
                    focusOffset: range.endOffset,
                });
            }
        });
    }
        };
    }
    /**
     * @param {string} text
     * @param {string} url
     */
    handlePasteUrl(text, url) {
        if (isImageUrl(url)) {
            const restoreSavepoint = this.shared.makeSavePoint();
            // Open powerbox with commands to embed media or paste as link.
            // Insert URL as text, revert it later if a command is triggered.
            this.shared.domInsert(text);
            this.dispatch("ADD_STEP");
            const embedImageCommand = {
                name: _t("Embed Image"),
                description: _t("Embed the image in the document."),
                fontawesome: "fa-image",
                action: () => {
                    const img = document.createElement("IMG");
                    img.setAttribute("src", url);
                    this.shared.domInsert(img);
                    this.dispatch("ADD_STEP");
                },
            };
            const commands = [embedImageCommand, this.shared.getPathAsUrlCommand(text, url)];
            this.shared.openPowerbox({ commands, onApplyCommand: restoreSavepoint });
            return true;
        }
    }
}
registry.category("phoenix_plugins").add(ImagePlugin.name, ImagePlugin);
