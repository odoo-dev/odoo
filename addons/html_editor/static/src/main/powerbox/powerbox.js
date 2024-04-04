import { Component, onPatched, useExternalListener, useRef, useState } from "@odoo/owl";
import { rotate } from "@web/core/utils/arrays";
import { useBus } from "@web/core/utils/hooks";

/**
 * @todo @phoenix i think that most of the "control" code in this component
 * should move to the powerbox plugin instead. This would probably be more robust
 */
export class Powerbox extends Component {
    static template = "html_editor.Powerbox";
    static props = {
        document: { validate: (doc) => doc.constructor.name === "HTMLDocument" },
        overlay: Object,
        initialState: Object,
        bus: Object,
        onApplyCommand: Function,
    };

    setup() {
        const ref = useRef("root");
        this.state = useState({
            commandIndex: 0,
            commands: this.props.initialState.commands,
            showCategories: this.props.initialState.showCategories,
        });

        useBus(this.props.bus, "updateCommands", (ev) => {
            const { commands, showCategories } = ev.detail;
            Object.assign(this.state, {
                commands,
                showCategories,
                commandIndex: 0,
            });
        });

        onPatched(() => {
            const activeCommand = ref.el.querySelector(".o-we-command.active");
            if (activeCommand) {
                activeCommand.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
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
                    const currentIndex = this.state.commandIndex;
                    const nextIndex = rotate(currentIndex, this.state.commands, -1);
                    this.state.commandIndex = nextIndex;
                    break;
                }
                case "ArrowDown": {
                    ev.preventDefault();
                    const currentIndex = this.state.commandIndex;
                    const nextIndex = rotate(currentIndex, this.state.commands, 1);
                    this.state.commandIndex = nextIndex;
                    break;
                }
            }
        });

        useExternalListener(document, "mousedown", (ev) => {
            this.props.overlay.close();
        });
    }

    applyCommand(command) {
        this.props.onApplyCommand(command);
        this.props.overlay.close();
    }

    applyCurrentCommand() {
        this.applyCommand(this.state.commands[this.state.commandIndex]);
    }

    onMouseEnter(commandIndex) {
        this.state.commandIndex = commandIndex;
    }
}
