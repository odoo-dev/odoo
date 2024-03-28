import { registry } from "@web/core/registry";
import { fuzzyLookup } from "@web/core/utils/search";
import { Plugin } from "../../plugin";

/**
 * @typedef {import("./powerbox_plugin").CommandGroup} CommandGroup
 * @typedef {import("../core/selection_plugin").EditorSelection} EditorSelection
 */

export class SearchPowerboxPlugin extends Plugin {
    static name = "search_powerbox";
    static dependencies = ["powerbox", "selection", "history"];
    setup() {
        this.commandGroups = this.getCommandGroups();
        this.addDomListener(this.editable, "keydown", (ev) => {
            if (ev.key === "/") {
                this.openPowerbox();
            }
        });
        this.addDomListener(this.editable, "input", this.update);
    }
    handleCommand(command) {
        switch (command) {
            case "DELETE_BACKWARD":
            case "DELETE_FORWARD":
                this.update();
                break;
        }
    }
    update() {
        if (!this.shared.isPowerboxOpen()) {
            return;
        }
        const selection = this.shared.getEditableSelection();
        this.searchNode = selection.startContainer;
        if (!this.isSearching(selection)) {
            this.shared.closePowerbox();
            return;
        }
        const searchTerm = this.searchNode.nodeValue.slice(this.offset + 1, selection.endOffset);
        if (!searchTerm) {
            this.shared.updatePowerbox(this.commandGroups);
            return;
        }
        if (searchTerm.includes(" ")) {
            this.shared.closePowerbox();
            return;
        }
        const commandGroups = this.filterCommands(searchTerm);
        if (!commandGroups.length) {
            this.shared.closePowerbox();
            return;
        }
        this.shared.updatePowerbox(commandGroups);
    }
    /**
     * @param {string} searchTerm
     */
    filterCommands(searchTerm) {
        /** @type {CommandGroup[]} */
        return this.commandGroups
            .map((group) => {
                const commands = fuzzyLookup(searchTerm.toLowerCase(), group.commands, (cmd) =>
                    (cmd.name + cmd.description + group.name).toLowerCase()
                );
                if (!commands.length) {
                    return null;
                }
                return { ...group, commands };
            })
            .filter(Boolean);
    }
    /**
     * @param {EditorSelection} selection
     */
    isSearching(selection) {
        return (
            selection.endContainer === this.searchNode &&
            this.searchNode.nodeValue[this.offset] === "/" &&
            selection.endOffset >= this.offset
        );
    }
    openPowerbox() {
        const selection = this.shared.getEditableSelection();
        this.offset = selection.startOffset;
        const historySavePointRestore = this.shared.makeSavePoint();
        this.shared.openPowerbox({
            commandGroups: this.commandGroups,
            onApplyCommand: historySavePointRestore,
        });
    }
    getCommandGroups() {
        /** @type {CommandGroup[]} */
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
registry.category("phoenix_plugins").add(SearchPowerboxPlugin.name, SearchPowerboxPlugin);
