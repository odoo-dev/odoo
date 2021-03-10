/** @odoo-module **/
import { useService } from "../core/hooks";
import { serviceRegistry } from "../webclient/service_registry";
const { hooks } = owl;
const { onMounted, onWillUnmount } = hooks;

/**
 * This hook will subscribe/unsubscribe the given subscription
 * when the caller component will mount/unmount.
 *
 * @param {{hotkey: string, callback: (hotkey:string)=>void, hint?: string}} subscription
 */
export function useHotkey(subscription) {
  const commandPaletteService = useService("commandPalette");
  let token;
  onMounted(() => {
    token = commandPaletteService.subscribe(subscription);
  });
  onWillUnmount(() => {
    commandPaletteService.unsubscribe(token);
  });
}

export const commandPaletteService = {
  name: "commandPalette",
  dependencies: [],
  deploy(env) {
    const subscriptions = new Map();
    let nextToken = 0;

    /**
     * Registers a new subscription.
     *
     * @param {{hotkey: string, callback: (hotkey:string)=>void, hint?: string}} sub
     * @returns {number} subscription token
     */
    function subscribe(sub) {
      const { hotkey, callback, hint } = sub;

      /**
       * An hotkey must comply to these rules:
       *  - all parts are whitelisted
       *  - single key part comes last
       *  - each part is separated by the dash character: "-"
       */
      const keys = hotkey.split("-");

      // Add subscription
      const token = nextToken++;
      const subscription = Object.assign({}, sub, { contextOwner: null });
      subscriptions.set(token, subscription);

      // Due to the way elements are mounted in the DOM by Owl (bottom-to-top),
      // we need to wait the next micro task tick to set the context owner of the subscription.
      Promise.resolve().then(() => {
        subscription.contextOwner = env.services.ui.getOwner();
      });

      return token;
    }

    /**
     * Unsubscribes the token corresponding subscription.
     *
     * @param {number} token
     */
    function unsubscribe(token) {
      subscriptions.delete(token);
    }

    function display() {

    }

    return {
      display,
      subscribe,
      unsubscribe,
    };
  },
};

serviceRegistry.add(commandPaletteService.name, commandPaletteService);
