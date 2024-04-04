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
        this.state = reactive({});

        this.onApplyCommand = () => {};

        /** @type {import("@html_editor/core/overlay_plugin").Overlay} */
        this.overlay = this.shared.createOverlay(Powerbox, {
            position: "bottom",
            onClose: () => this.onClose?.(),
        });
        this.overlayProps = {
            document: this.document,
            overlay: this.overlay,
            state: this.state,
            onApplyCommand: (command) => {
                this.onApplyCommand();
                command.action(this.dispatch);
            },
        };
    }

    /**
     * @param {Command[]} commands
     */
    openPowerbox({ commands, categories, onApplyCommand = () => {}, onClose = () => {} } = {}) {
        this.closePowerbox();
        this.state.showCategories = Boolean(categories);
        this.state.categories = categories;
        this.state.commands = categories ? this.getOrderCommands(commands, categories) : commands;
        this.onApplyCommand = onApplyCommand;
        this.onClose = onClose;
        this.overlay.open({ props: this.overlayProps });
    }
    /**
     * @param {Command[]} commands
     * @param {Category[]} categories
     */
    updatePowerbox(commands, categories) {
        this.state.commands = categories
            ? this.getOrderCommands(commands, this.state.categories)
            : commands;
        this.state.showCategories = Boolean(categories);
        this.overlay.open({ props: this.overlayProps });
    }
    getOrderCommands(commands, categories) {
        const orderCommands = [];
        for (const category of categories) {
            orderCommands.push(...commands.filter((command) => command.category === category.id));
        }
        return orderCommands;
    }
    closePowerbox() {
        this.onClose?.();
        this.overlay.close();
    }
    isPowerboxOpen() {
        return this.overlay.isOpen;
    }
}
