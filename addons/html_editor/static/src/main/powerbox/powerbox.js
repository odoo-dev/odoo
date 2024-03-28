import {
    Component,
    onMounted,
    onPatched,
    onWillRender,
    useExternalListener,
    useRef,
    useState,
} from "@odoo/owl";
import { rotate } from "@web/core/utils/arrays";

/**
 * @todo @phoenix i think that most of the "control" code in this component
 * should move to the powerbox plugin instead. This would probably be more robust
 */
export class Powerbox extends Component {
    static template = "html_editor.Powerbox";
    static props = {
        document: { validate: (doc) => doc.constructor.name === "HTMLDocument" },
        onMounted: Function,
        close: Function,
        onPatched: Function,
        commandGroups: Object,
        onApplyCommand: Function,
    };

    setup() {
        const ref = useRef("root");
        this.commandGroups = this.props.commandGroups;
        this.state = useState({ currentCommand: null });

        this.commands = [];
        onMounted(() => {
            this.props.onMounted(ref.el);
        });

        onPatched(() => {
            const activeCommand = ref.el.querySelector(".o-we-command.active");
            if (activeCommand) {
                activeCommand.scrollIntoView({ block: "nearest", inline: "nearest" });
            }
            this.props.onPatched(ref.el);
        });

        onWillRender(() => {
            this.commands = this.commandGroups.map((group) => group.commands).flat();
            if (!this.commands.includes(this.state.currentCommand)) {
                this.state.currentCommand = this.commands[0];
            }
        });

        useExternalListener(this.props.document, "keydown", (ev) => {
            const key = ev.key;
            switch (key) {
                case "Escape":
                    this.props.close();
                    break;
                case "Enter":
                case "Tab":
                    ev.preventDefault();
                    ev.stopImmediatePropagation();
                    this.applyCurrentCommand();
                    break;
                case "ArrowUp": {
                    ev.preventDefault();
                    const currentIndex = this.commands.indexOf(this.state.currentCommand);
                    const nextIndex = rotate(currentIndex, this.commands, -1);
                    this.state.currentCommand = this.commands[nextIndex];
                    this.render();
                    break;
                }
                case "ArrowDown": {
                    ev.preventDefault();
                    const currentIndex = this.commands.indexOf(this.state.currentCommand);
                    const nextIndex = rotate(currentIndex, this.commands, 1);
                    this.state.currentCommand = this.commands[nextIndex];
                    this.render();
                    break;
                }
            }
        });

        useExternalListener(document, "mousedown", (ev) => {
            this.props.close();
        });
    }

    applyCommand(command) {
        this.props.onApplyCommand(command);
        this.props.close();
    }

    applyCurrentCommand() {
        this.applyCommand(this.state.currentCommand);
    }
}
