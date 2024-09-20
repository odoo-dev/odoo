import {
    VERSION,
    VERSION_SELECTOR,
    stripVersion,
} from "@html_editor/versioning/__editor_manifest__";
import { Plugin } from "@html_editor/plugin";

export class VersionPlugin extends Plugin {
    static name = "version";

    handleCommand(command, payload) {
        switch (command) {
            case "CLEAN_FOR_SAVE":
                this.cleanForSave(payload.root);
                break;
            case "NORMALIZE":
                this.normalize(payload.node);
                break;
        }
    }

    normalize(parent) {
        if (parent.matches(VERSION_SELECTOR) && parent !== this.editable) {
            delete parent.dataset.oeVersion;
        }
        stripVersion(parent);
    }

    cleanForSave(root) {
        const firstChild = root.firstElementChild;
        if (firstChild) {
            firstChild.dataset.oeVersion = VERSION;
        }
    }
}
