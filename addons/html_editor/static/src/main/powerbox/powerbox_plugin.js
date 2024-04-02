import { _t } from "@web/core/l10n/translation";
import { Plugin } from "@html_editor/plugin";
import { isEmpty } from "@html_editor/utils/dom_info";
import { Powerbox } from "./powerbox";
import { reactive } from "@odoo/owl";

/**
 * @typedef {Object} CategoriesConfig
 * @property {string} id
 * @property {string} sequence
 *
 * @typedef {Object} Command
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string} fontawesome
 * @property {Function} action
 *
 * @typedef {Object} CommandGroup
 * @property {string} id
 * @property {string} name
 * @property {Command[]} commands
 */

function target(selection) {
    const node = selection.anchorNode;
    const el = node instanceof Element ? node : node.parentElement;
    return (el.tagName === "DIV" || el.tagName === "P") && isEmpty(el) && el;
}

export class PowerboxPlugin extends Plugin {
    static name = "powerbox";
    static dependencies = ["overlay", "selection", "history"];
    static shared = ["openPowerbox", "updatePowerbox", "closePowerbox", "isPowerboxOpen"];
    static resources = () => ({
        temp_hints: {
            text: _t('Type "/" for commands'),
            target,
        },
        powerboxCategory: { id: "structure", name: _t("Structure"), sequence: 10 },
    });

    setup() {
        this.commandGroups = reactive([]);

        this.onApplyCommand = () => {};

        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.overlay = this.shared.createOverlay(Powerbox, {
            document: this.document,
            close: () => {
                return this.closePowerbox();
            },
            onMounted: (el) => {
                el.style.position = "absolute";
                this.overlay.position = "bottom";
                this.overlay.offsetY = 0;
                this.overlay.el = el;
                this.overlay.updatePosition();
            },
            onPatched: () => this.overlay.updatePosition(),
            commandGroups: this.commandGroups,
            onApplyCommand: (command) => {
                this.onApplyCommand();
                command.action(this.dispatch);
            },
        });
    }

    /**
     * @param {Command[]} commands
     */
    openPowerbox({
        commands,
        categoriesConfig,
        onApplyCommand = () => {},
        commandGroups,
        onClose = () => {},
    } = {}) {
        this.closePowerbox();
        if (!commandGroups) {
            if (!categoriesConfig?.length) {
                commandGroups = [{ id: "Main", name: _t("Main"), commands }];
            } else {
                commandGroups = this.getCommandGroups(commands, categoriesConfig);
            }
        }
        this.commandGroups.splice(0, this.commandGroups.length, ...commandGroups);
        this.onApplyCommand = onApplyCommand;
        this.onClose = onClose;
        this.overlay.open();
    }
    /**
     * @param {CommandGroup[]} commandGroups
     */
    updatePowerbox(commandGroups) {
        this.commandGroups.splice(0, this.commandGroups.length, ...commandGroups);
        this.overlay.open();
    }
    closePowerbox() {
        this.onClose?.();
        this.overlay.close();
    }
    isPowerboxOpen() {
        return this.overlay.isOpen;
    }

    /**
     * @param {Command[]} commands
     * @param {CategoriesConfig[]} categoriesConfig
     * @returns {CommandGroup[]}
     */
    getCommandGroups(commands, categoriesConfig) {
        const commandGroups = [];
        for (const category of categoriesConfig.sort((a, b) => a.sequence - b.sequence)) {
            commandGroups.push({
                id: category.id,
                name: category.name,
                commands: commands.filter((cmd) => cmd.category === category.id),
            });
        }
        return commandGroups;
    }
}
