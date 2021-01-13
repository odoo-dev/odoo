/** @odoo-module **/
const { Component, hooks } = owl;
import { Dropdown } from "../../../components/dropdown/dropdown";
import { Registry } from "../../../core/registry";
import { DropdownItem } from "../../../components/dropdown/dropdown_item";
import { FACET_ICONS } from "../../view_utils/search_utils";
import { Dialog } from "../../../components/dialog/dialog";
const { useState } = hooks;
export class FavoriteMenu extends Component {
  constructor() {
    super(...arguments);
    this.icon = FACET_ICONS.favorite;
    this.title = this.env._t("Favorites");
    this.state = useState({});
  }
  get items() {
    const favorites = this.props.searchModel.getSearchItems(
      (searchItem) => searchItem.type === "favorite"
    );
    const registryMenus = [];
    for (const Component of odoo.favoriteMenuRegistry.getAll()) {
      if (Component.shouldBeDisplayed(this.env)) {
        registryMenus.push({
          key: Component.name,
          groupNumber: Component.groupNumber,
          Component,
        });
      }
    }
    return [...favorites, ...registryMenus];
  }
  emptyState() {
    delete this.state.toDelete;
  }
  onDeletionConfirmed(itemId) {
    this.emptyState();
    this.props.searchModel.deleteFavorite(itemId);
  }
  onDropdownItemSelected(ev) {
    const { itemId } = ev.detail.payload;
    this.props.searchModel.toggleSearchItem(itemId);
  }
  openDialog(itemId) {
    const { id, userId } = this.items.find((favorite) => favorite.id === itemId);
    this.state.toDelete = { itemId: id, userId };
  }
}
FavoriteMenu.registry = new Registry();
FavoriteMenu.components = { Dialog, Dropdown, DropdownItem };
FavoriteMenu.template = "wowl.FavoriteMenu";
