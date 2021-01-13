/** @odoo-module **/
import { Registry } from "../../../core/registry";
import { CustomFavoriteItem } from "./custom_favorite_item";
export const favoriteMenuRegistry = new Registry();
favoriteMenuRegistry.add("favorite-generator-menu", CustomFavoriteItem);
