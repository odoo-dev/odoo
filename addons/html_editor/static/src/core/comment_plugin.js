import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { descendants } from "../utils/dom_traversal";

class CommentPlugin extends Plugin {
    static name = "comment";

    handleCommand(command, payload) {
        switch (command) {
            case "NORMALIZE":
                this.removeComment(payload.node);
                break;
        }
    }

    removeComment(node) {
        for (const el of [node, ...descendants(node)]) {
            if (el.nodeType === Node.COMMENT_NODE) {
                el.remove();
                return;
            }
        }
    }
}

registry.category("phoenix_plugins").add(CommentPlugin.name, CommentPlugin);
