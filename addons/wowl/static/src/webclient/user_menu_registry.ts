import { Registry } from "../core/registry";
import { UserMenuItemFactory } from "./user_menu/user_menu";
import { documentationItem, logOutItem, odooAccountItem, preferencesItem, shortCutsItem, supportItem } from "./user_menu/user_menu_items";

// -----------------------------------------------------------------------------
// Default UserMenu items
// -----------------------------------------------------------------------------

export const userMenuRegistry: Registry<UserMenuItemFactory> = new Registry();

userMenuRegistry
  .add("documentation", documentationItem)
  .add("support", supportItem)
  .add("shortcuts", shortCutsItem)
  .add("profile", preferencesItem)
  .add("odoo_account", odooAccountItem)
  .add("log_out", logOutItem);
