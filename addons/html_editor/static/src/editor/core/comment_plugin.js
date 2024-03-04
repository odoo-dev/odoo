import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";

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
        if (node.nodeType === Node.COMMENT_NODE) {
            node.remove();
            return;
        }
        for (const child of node.childNodes) {
            this.removeComment(child);
        }
    }
}

registry.category("phoenix_plugins").add(CommentPlugin.name, CommentPlugin);
