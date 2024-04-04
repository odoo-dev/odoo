import { Component, onPatched, onWillRender, useExternalListener, useRef } from "@odoo/owl";
import { rotate } from "@web/core/utils/arrays";

/**
 * @todo @phoenix i think that most of the "control" code in this component
 * should move to the powerbox plugin instead. This would probably be more robust
 */
export class Powerbox extends Component {
    static template = "html_editor.Powerbox";
    static props = {
        document: { validate: (doc) => doc.constructor.name === "HTMLDocument" },
        overlay: Object,
        state: Object,
        onApplyCommand: Function,
    };

    setup() {
        const ref = useRef("root");
        this.commandIndex = 0;

        let lastCommandIndex = 0;
        onWillRender(() => {
            if (lastCommandIndex === this.commandIndex) {
                this.commandIndex = 0;
                lastCommandIndex = 0;
            } else {
                lastCommandIndex = this.commandIndex;
            }
        });

        onPatched(() => {
            const activeCommand = ref.el.querySelector(".o-we-command.active");
            if (activeCommand) {
                activeCommand.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
            this.props.overlay.updatePosition();
        });

        useExternalListener(this.props.document, "keydown", (ev) => {
            const key = ev.key;
            switch (key) {
                case "Escape":
                    this.props.overlay.close();
                    break;
                case "Enter":
                case "Tab":
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    this.applyCurrentCommand();
                    break;
                case "ArrowUp": {
                    ev.preventDefault();
                    const currentIndex = this.commandIndex;
                    const nextIndex = rotate(currentIndex, this.commands, -1);
                    this.commandIndex = nextIndex;
                    this.render();
                    break;
                }
                case "ArrowDown": {
                    ev.preventDefault();
                    const currentIndex = this.commandIndex;
                    const nextIndex = rotate(currentIndex, this.commands, 1);
                    this.commandIndex = nextIndex;
                    this.render();
                    break;
                }
            }
        });

        useExternalListener(document, "mousedown", (ev) => {
            this.props.overlay.close();
        });
    }

    get commands() {
        return this.props.state.commands;
    }

    get showCategories() {
        return this.props.state.showCategories;
    }

    applyCommand(command) {
        this.props.onApplyCommand(command);
        this.props.overlay.close();
    }

    applyCurrentCommand() {
        this.applyCommand(this.commands[this.commandIndex]);
    }

    onMouseEnter(commandIndex) {
        this.commandIndex = commandIndex;
        this.render();
    }
}
