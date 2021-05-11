/** @odoo-module **/

import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { FACET_ICONS } from "../search_utils";
import { registry } from "@web/core/registry";
import { SearchComponent } from "../search_component";
import { useService } from "@web/core/service_hook";

const favoriteMenuRegistry = registry.category("favoriteMenu");

const { QWeb } = owl;

class FavoriteMenuDialog extends ConfirmationDialog {}
FavoriteMenuDialog.size = "modal-md";

export class FavoriteMenu extends SearchComponent {
    setup() {
        super.setup();
        this.icon = FACET_ICONS.favorite;
        this._dialogService = useService("dialog");
    }

    /**
     * @returns {Array}
     */
    get items() {
        const favorites = this.env.searchModel.getSearchItems(
            (searchItem) => searchItem.type === "favorite"
        );
        const registryMenus = [];
        for (const Component of favoriteMenuRegistry.getAll()) {
            if (Component.shouldBeDisplayed(this.env)) {
                registryMenus.push({
                    Component,
                    groupNumber: Component.groupNumber,
                    key: Component.name,
                });
            }
        }
        return [...favorites, ...registryMenus];
    }

    /**
     * @param {CustomEvent} ev
     */
    onFavoriteSelected(ev) {
        const { itemId } = ev.detail.payload;
        this.env.searchModel.toggleSearchItem(itemId);
    }

    /**
     * @param {number} itemId
     */
    openConfirmationDialog(itemId) {
        const { userId } = this.items.find((item) => item.id === itemId);
        const dialogProps = {
            title: this.env._t("Warning"),
            body: userId
                ? this.env._t("Are you sure that you want to remove this filter?")
                : this.env._t(
                      "This filter is global and will be removed for everybody if you continue."
                  ),
            confirm: () => this.env.searchModel.deleteFavorite(itemId),
            cancel: () => {},
        };
        this._dialogService.open(FavoriteMenuDialog, dialogProps);
    }
}

FavoriteMenu.template = "wowl.FavoriteMenu";

QWeb.registerComponent("FavoriteMenu", FavoriteMenu);
