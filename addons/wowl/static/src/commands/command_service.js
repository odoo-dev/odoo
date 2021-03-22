/** @odoo-module **/
import { serviceRegistry } from "../webclient/service_registry";
import { DEFAULT_COMMAND_CATEGORY } from "./command_category_registry";
import { CommandPalette } from "./command_palette";

/**
 * @typedef {{name: string, action: ()=>void, category?: string, hotkey?: string} Command
 */

export const commandService = {
  dependencies: ["dialog", "hotkey", "ui"],
  deploy(env) {
    const { dialog, hotkey: hotkeyService, ui } = env.services;
    const registeredCommands = new Map();
    let nextToken = 0;

    function displayPalette() {
      const commands = [...registeredCommands.values()];

      // Also retrieve all hotkeyables elements
      for (const el of ui.getVisibleElements("[aria-keyshortcuts]:not(:disabled)")) {
        const closest = el.closest("[data-command-category]");
        const category = closest
          ? closest.dataset.commandCategory
          : DEFAULT_COMMAND_CATEGORY;

        commands.push({
          name: `${el.title || el.placeholder || "no description provided"}`,
          hotkey: el.getAttribute("aria-keyshortcuts"),
          action: () => { el.focus(); el.click(); },
          category,
        });
      }

      // Open palette dialog
      dialog.open(CommandPalette, { commands });
    }

    hotkeyService.registerHotkey("control+k", displayPalette, { allowInEditable: true });

    /**
     * @param {Command} command
     * @returns {number} token
     */
    function registerCommand(command) {
      if (!command.name || !command.action || typeof command.action !== "function") {
        throw new Error("A Command must have a name and an action function.");
      }

      const registration = Object.assign({}, command, { contextElement: null });

      if (command.hotkey) {
        registration.hotkeyToken = hotkeyService.registerHotkey(command.hotkey, command.action);
      }

      const token = nextToken++;
      registeredCommands.set(token, registration);

      // Due to the way elements are mounted in the DOM by Owl (bottom-to-top),
      // we need to wait the next micro task tick to set the context activate 
      // element of the subscription.
      Promise.resolve().then(() => {
        registration.contextElement = ui.activeElement;
      });

      return token;
    }

    /**
     * Unsubscribes the token corresponding subscription.
     *
     * @param {number} token
     */
    function unregisterCommand(token) {
      const cmd = registeredCommands.get(token);
      if (cmd && cmd.hotkeyToken >= 0) {
        env.services.hotkey.unregisterHotkey(cmd.hotkeyToken);
      }
      registeredCommands.delete(token);
    }

    return {
      registerCommand,
      unregisterCommand,
    };
  },
};

serviceRegistry.add("command", commandService);
