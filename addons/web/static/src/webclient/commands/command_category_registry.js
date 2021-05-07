/** @odoo-module **/

import { _lt } from "../../core/l10n/translation";
import { Registry } from "../../core/registry";

export const commandCategoryRegistry = new Registry();
commandCategoryRegistry.add("app", { label: _lt("Current App Commands") }, { sequence: 10 });
commandCategoryRegistry.add("mail", { label: _lt("Discuss") }, { sequence: 20 });
commandCategoryRegistry.add("actions", { label: _lt("More Actions") }, { sequence: 30 });
commandCategoryRegistry.add("navbar", { label: _lt("NavBar") }, { sequence: 40 });
commandCategoryRegistry.add("default", { label: _lt("Other commands") }, { sequence: 100 });
