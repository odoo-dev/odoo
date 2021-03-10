/** @odoo-module **/
import { serviceRegistry } from "../webclient/service_registry";
import { CommandPaletteDialog } from "./command_palette_dialog";

export const commandPaletteService = {
  name: "command_palette",
  dependencies: ["dialog"],
  deploy(env) {
    function open(arg) {
      env.services.dialog.open(CommandPaletteDialog, arg);
    }
    return {
      open
    };
  },
};

serviceRegistry.add(commandPaletteService.name, commandPaletteService);
