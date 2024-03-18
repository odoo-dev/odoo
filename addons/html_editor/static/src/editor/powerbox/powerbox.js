import { Component, onMounted, onPatched, useExternalListener, useRef } from "@odoo/owl";
import { rotate } from "@web/core/utils/arrays";
import { fuzzyLookup } from "@web/core/utils/search";
import { useOverlay } from "../core/overlay_plugin";

/**
 * @todo @phoenix i think that most of the "control" code in this component
 * should move to the powerbox plugin instead. This would probably be more robust
 */
export class Powerbox extends Component {
    static template = "html_editor.Powerbox";
    static props = {
        dispatch: Function,
        el: {
            validate: (el) => el.nodeType === Node.ELEMENT_NODE,
        },
        offset: Function,
        groups: Array,
        onApplyCommand: Function,
    };

    setup() {
        const ref = useRef("root");
        this.search = "";
        this.cmdIndex = 0;
        // text node and offset for the / character
        this.offset = this.props.offset();
        this.commands = null;
        this.categories = null;
        const ownerDocument = this.props.el.ownerDocument;
        const selection = ownerDocument.getSelection();
        const range = selection.getRangeAt(0);
        this.endOffset = range.endOffset;
        this.node = range.startContainer;
        if (!range.collapsed) {
            throw new Error("Need to check if this is legit...");
        }
        const search = this.node.nodeValue?.slice(this.offset + 1, this.endOffset) || "";
        this.computeCommands(search);

        this.overlay = useOverlay("root", "bottom");
        onMounted(() => {
            if (this.node.nodeType !== Node.TEXT_NODE) {
                // in this case, we have an element, but we want the text node that
                // was created by the new character "/";
                this.node = this.node.firstChild;
            }
            const prevChar = this.node.nodeValue[this.offset];
            if (prevChar !== "/") {
                this.overlay.close();
            }
        });
        onPatched(() => {
            const activeCommand = ref.el.querySelector(".o-we-command.active");
            if (activeCommand) {
                activeCommand.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
        });

        useExternalListener(this.props.el, "keydown", (ev) => {
            const key = ev.key;
            switch (key) {
                case "Escape":
                    this.overlay.close();
                    break;
                case "Enter":
                case "Tab":
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    this.applyCurrentCommand();
                    break;
                case "ArrowUp":
                    ev.preventDefault();
                    this.cmdIndex = rotate(this.cmdIndex, this.commands, -1);
                    this.render();
                    break;
                case "ArrowDown":
                    ev.preventDefault();
                    this.cmdIndex = rotate(this.cmdIndex, this.commands, 1);
                    this.render();
                    break;
            }
        });

        useExternalListener(this.props.el, "input", (ev) => {
            const range = ownerDocument.getSelection().getRangeAt(0);
            if (!this.isSearching(range)) {
                this.overlay.close();
                return;
            }
            this.endOffset = range.endOffset;
            const search = this.node.nodeValue.slice(this.offset + 1, this.endOffset);
            this.computeCommands(search);
            this.render();
        });
        useExternalListener(document, "mousedown", (ev) => {
            this.overlay.close();
        });
    }

    isSearching(range) {
        return (
            range.endContainer === this.node &&
            this.node.nodeValue[this.offset] === "/" &&
            range.endOffset >= this.offset
        );
    }

    computeCommands(search = "") {
        this.commands = [];
        this.categories = [];
        for (const group of this.props.groups) {
            const category = {
                id: group.id,
                name: group.name,
            };
            category.commands = search
                ? fuzzyLookup(search.toLowerCase(), group.commands, (cmd) =>
                      (cmd.name + cmd.description + category.name).toLowerCase()
                  )
                : group.commands;
            if (category.commands.length) {
                this.commands = [...this.commands, ...category.commands];
                this.categories.push(category);
            }
        }
        this.cmdIndex = 0;
        if (!this.commands.length) {
            this.overlay.close();
        }
    }

    activateCommand(command) {
        const index = this.commands.indexOf(command);
        if (index > -1) {
            this.cmdIndex = index;
            this.render();
        }
    }

    applyCommand(command) {
        // Restore state before insertion of "/"
        this.props.onApplyCommand();

        command.action(this.props.dispatch);
        this.overlay.close();
    }

    applyCurrentCommand() {
        this.applyCommand(this.commands[this.cmdIndex]);
    }
}
