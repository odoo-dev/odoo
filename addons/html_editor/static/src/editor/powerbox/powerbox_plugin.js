import { registry } from "@web/core/registry";
import { Plugin } from "../plugin";
import { isEmpty } from "../utils/dom_info";
import { Powerbox } from "./powerbox";
import { _t } from "@web/core/l10n/translation";

function target(selection) {
    const node = selection.anchorNode;
    const el = node instanceof Element ? node : node.parentElement;
    return (el.tagName === "DIV" || el.tagName === "P") && isEmpty(el) && el;
}

export class PowerboxPlugin extends Plugin {
    static name = "powerbox";
    static dependencies = ["overlay", "selection", "history"];
    static resources = () => ({
        temp_hints: {
            text: 'Type "/" for commands',
            target,
        },
        powerboxCategory: { id: "structure", name: _t("Structure"), sequence: 10 },
    });

    setup() {
        this.offset = 0;
        this.groups = this.getGroups();
        this.historySavePointRestore = null;

        /** @type {import("../core/overlay_plugin").Overlay} */
        this.powerbox = this.shared.createOverlay(Powerbox, "bottom", {
            dispatch: this.dispatch,
            el: this.editable,
            offset: () => this.offset,
            groups: this.groups,
            onApplyCommand: () => this.historySavePointRestore(),
        });
        // @todo @phoenix: consider using keydown or beforeinput instead
        this.addDomListener(this.editable, "keypress", (ev) => {
            if (ev.key === "/") {
                this.openPowerbox();
            }
        });
    }

    openPowerbox() {
        const selection = this.document.getSelection();
        const range = selection.rangeCount && selection.getRangeAt(0);
        this.offset = range && range.startOffset;
        this.historySavePointRestore = this.shared.makeSavePoint();
        this.powerbox.open();
    }

    getGroups() {
        const groups = [];
        for (const category of this.resources.powerboxCategory.sort(
            (a, b) => a.sequence - b.sequence
        )) {
            groups.push({
                id: category.id,
                name: category.name,
                commands: this.resources.powerboxCommands.filter(
                    (cmd) => cmd.category === category.id
                ),
            });
        }
        return groups;
    }
}

registry.category("phoenix_plugins").add(PowerboxPlugin.name, PowerboxPlugin);
