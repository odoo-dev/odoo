/** @odoo-module **/
import { useService } from "../core/hooks";
import { serviceRegistry } from "../webclient/service_registry";
const { hooks } = owl;

/**
 * This hook will subscribe/unsubscribe the given subscriptions
 * when the caller component will mount/unmount.
 *
 * @param {{hotkeys: string[], callback: (hotkey:string)=>void}[]} subscriptions
 */
export function useHotkeys(subscriptions) {
  const hotkeyService = useService("hotkey");
  let tokens = [];
  hooks.onMounted(() => {
    tokens = subscriptions.map(sub => hotkeyService.subscribe(sub));
  });
  hooks.onWillUnmount(() => {
    tokens.forEach(token => hotkeyService.unsubscribe(token));
    tokens = [];
  });
}

const MODIFIERS = ["control", "shift"];
const ALPHANUM_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const NAV_KEYS = [
  "arrowleft", "arrowright", "arrowup", "arrowdown",
  "pageup", "pagedown", "home", "end",
  "backspace", "enter", "escape",
]
const AUTHORIZED_KEYS = [...ALPHANUM_KEYS, ...NAV_KEYS];

export const hotkeyService = {
  name: "hotkey",
  dependencies: ["ui"],
  deploy(env) {
    const subscriptions = {};
    let nextToken = 0;

    window.addEventListener("keydown", onKeydown);

    /**
     * Handler for keydown events.
     *
     * @param {KeyboardEvent} ev
     */
    async function onKeydown(ev) {
      const hotkey = getActiveHotkey(ev);
      const infos = { hotkey, _originalEvent: ev };
      if (await canDispatch(infos)) {
        dispatch(infos);
      }
    }

    /**
     * Verifies if the keyboard event can be dispatched or not.
     * Rules sequence to forbid dispatching :
     * - UI is blocked
     * - key is held down (to avoid repeat)
     * - focus is on an editable element (rule is bypassed on "ALT" combo)
     * - the pressed key is not whitelisted
     *
     * @param {{hotkey: string, _originalEvent: KeyboardEvent}} infos
     * @returns {boolean} true if service can dispatch the actual hotkey
     */
    async function canDispatch(infos) {
      const { hotkey, _originalEvent: event } = infos;

      // Do not dispatch if UI is blocked
      if (env.services.ui.isBlocked) {
        return false;
      }

      // Do not dispatch if user holds down a key
      if (event.repeat) {
        return false;
      }

      // Is the active element editable ?
      const inEditableElement =
        event.target.isContentEditable ||
        ["input", "textarea"].includes(event.target.nodeName);
      const isAltCombo = hotkey !== "alt" && event.altKey;
      if (inEditableElement && !isAltCombo) {
        return false;
      }

      // Is the pressed key NOT whitelisted ?
      const singleKey = hotkey.split("-").pop();
      if (!AUTHORIZED_KEYS.includes(singleKey)) {
        return false;
      }

      return true;
    }

    /**
     * Dispatches an hotkey to all matching subscriptions and
     * clicks on all elements having a data-hotkey attribute matching the hotkey.
     *
     * @param {string} hotkey
     */
    function dispatch(infos) {
      const { hotkey, _originalEvent: event } = infos;
      const uiOwnerElement = env.services.ui.getOwner();

      // 1. Dispatch actual hotkey to all matching subscriptions
      const subs = Object.values(subscriptions)
        .filter(s => s.contextOwner === uiOwnerElement && s.hotkeys.includes(hotkey));
      subs.forEach(sub => {
        sub.callback(hotkey);
      });
      if (subs.length) {
          // Prevent default on event as it has been handheld.
          event.preventDefault();
      }

      // 2. Click on all elements having a data-hotkey attribute matching the actual hotkey.
      const elems = uiOwnerElement.querySelectorAll(`[data-hotkey='${hotkey}']`);
      elems.forEach(el => el.click());
      if (elems.length) {
        // Prevent default on event as it has been handheld.
        event.preventDefault();
      }
    }

    /**
     * Get the actual hotkey being pressed.
     *
     * @param {KeyboardEvent} ev
     * @returns {string} the active hotkey
     */
    function getActiveHotkey(ev) {
      const hotkey = [];

      // ------- Modifiers -------
      // Modifiers are pushed in ascending order to the hotkey.
      if (ev.ctrlKey) {
        hotkey.push("control");
      }
      if (ev.shiftKey) {
        hotkey.push("shift");
      }

      // ------- Key -------
      let key = ev.key.toLowerCase();
      // Identify if the user has tapped on the number keys above the text keys.
      if (ev.code && ev.code.indexOf("Digit") === 0) {
        key = ev.code.slice(-1);
      }
      // Make sure we do not duplicate a modifier key
      if (!hotkey.includes(key)) {
        hotkey.push(key);
      }

      return hotkey.join("-");
    }

    /**
     * Registers a new subscription.
     *
     * @param {{hotkeys: string[], callback: (hotkey:string)=>void}} sub
     * @returns {number} subscription token
     */
    function subscribe(sub) {
      // Validate some informations
      if (sub.hotkeys.length === 0) {
        throw new Error('You must specify at least one hotkey when registering a subscription.');
      }

      if (!sub.callback || typeof sub.callback !== "function") {
        throw new Error('You must specify a callback function when registering a subscription.');
      }

      sub.hotkeys.forEach((hotkey) => {
        /**
         * An hotkey must comply to these rules:
         *  - all parts are whitelisted
         *  - single key part comes last
         *  - each part is separated by the dash character: "-"
         */
        const keys = hotkey.split("-");
        const mods = keys.filter((k) => MODIFIERS.includes(k));
        const others = keys.filter((k) => !mods.includes(k));

        if (others.some(k => !AUTHORIZED_KEYS.includes(k))) {
          throw new Error(
            `You are trying to subscribe for an hotkey ('${hotkey}')
             that contains parts not whitelisted: ${others.join(", ")}`
          );
        } else if (others.length > 1) {
          throw new Error(
            `You are trying to subscribe for an hotkey ('${hotkey}')
             that contains more than one single key part: ${others.join("-")}`
          );
        }
      })

      // Add subscription
      const token = nextToken++;
      const subscription = Object.assign({}, sub, { contextOwner: null });
      subscriptions[token] = subscription;

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
      delete subscriptions[token];
    }

    return {
      subscribe,
      unsubscribe,
    };
  },
};

serviceRegistry.add(hotkeyService.name, hotkeyService);
