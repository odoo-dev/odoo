/** @odoo-module **/

import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { CustomFilterItem } from "./custom_filter_item";
import { FACET_ICONS } from "../utils/misc";
import { useBus, useService } from "@web/core/utils/hooks";
import { useCommand } from "@web/core/commands/command_hook";

const { Component } = owl;

export class FilterMenu extends Component {
    setup() {
        this.icon = FACET_ICONS.filter;

        useBus(this.env.searchModel, "update", this.render);
        this.command = useService("command");
        useCommand(
            this.env._t("Filters"),
            async () => {
                const provider = {
                    provide: () => {
                        return this.items
                            .filter((item) => !item.options)
                            .map((item) => ({
                                name: item.description,
                                action: () => this.onFilterSelected({ itemId: item.id }),
                            }));
                    },
                };
                const commandPaletteConfig = {
                    placeholder: this.env._t("Choose a filter..."),
                    providers: [provider],
                };
                return this.command.openPalette(commandPaletteConfig);
            },
            {
                category: "control_panel",
            }
        );
    }

    /**
     * @returns {Object[]}
     */
    get items() {
        return this.env.searchModel.getSearchItems((searchItem) =>
            ["filter", "dateFilter"].includes(searchItem.type)
        );
    }

    /**
     * @param {Object} param0
     * @param {number} param0.itemId
     * @param {number} [param0.optionId]
     */
    onFilterSelected({ itemId, optionId }) {
        if (optionId) {
            this.env.searchModel.toggleDateFilter(itemId, optionId);
        } else {
            this.env.searchModel.toggleSearchItem(itemId);
        }
    }
}

FilterMenu.components = { CustomFilterItem, Dropdown, DropdownItem };
FilterMenu.template = "web.FilterMenu";
