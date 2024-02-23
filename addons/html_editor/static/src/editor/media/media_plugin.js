import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { ICON_SELECTOR, isIconElement } from "../utils/dom_info";

const MEDIA_SELECTOR = `${ICON_SELECTOR} , .o_image, .media_iframe_video`;
class MediaPlugin extends Plugin {
    static name = "media";

    handleCommand(command, payload) {
        switch (command) {
            case "NORMALIZE":
                this.normalizeMedia(payload.node);
                break;
            case "CLEAN":
                this.clean();
                break;
        }
    }

    normalizeMedia(node) {
        for (const el of node.querySelectorAll(MEDIA_SELECTOR)) {
            el.setAttribute("contenteditable", "false");
            if (isIconElement(el)) {
                el.textContent = "\u200B";
            }
        }
    }

    clean() {
        for (const el of this.editable.querySelectorAll(MEDIA_SELECTOR)) {
            el.removeAttribute("contenteditable");
            if (isIconElement(el)) {
                el.textContent = "";
            }
        }
    }
}

registry.category("phoenix_plugins").add(MediaPlugin.name, MediaPlugin);
