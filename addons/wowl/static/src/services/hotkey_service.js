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
  const hotkeyService = useService("hotkey");
  let token;
  onMounted(() => {
    token = hotkeyService.subscribe(subscription);
  });
  onWillUnmount(() => {
    hotkeyService.unsubscribe(token);
  });
}

const ALPHANUM_KEYS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const NAV_KEYS = [
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "pageup",
  "pagedown",
  "home",
  "end",
  "backspace",
  "enter",
  "escape",
];
const MODIFIERS = new Set(["control", "shift"]);
const AUTHORIZED_KEYS = new Set([...ALPHANUM_KEYS, ...NAV_KEYS]);

export const hotkeyService = {
  dependencies: ["ui"],
  deploy(env) {
    const subscriptions = new Map();
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
      if (canDispatch(infos)) {
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
    function canDispatch(infos) {
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
        event.target.isContentEditable || ["input", "textarea"].includes(event.target.nodeName);
      const isAltCombo = hotkey !== "alt" && event.altKey;
      if (inEditableElement && !isAltCombo) {
        return false;
      }

      // Is the pressed key NOT whitelisted ?
      const singleKey = hotkey.split("-").pop();
      if (!AUTHORIZED_KEYS.has(singleKey)) {
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
      let dispatched = false;
      const { hotkey, _originalEvent: event } = infos;
      const uiOwnerElement = env.services.ui.getOwner();

      // Dispatch actual hotkey to all matching subscriptions
      for (const [_, sub] of subscriptions) {
        if (sub.contextOwner === uiOwnerElement && sub.hotkey === hotkey) {
          sub.callback(hotkey);
          dispatched = true;
        }
      }

      // Click on all elements having a data-hotkey attribute matching the actual hotkey.
      const elems = uiOwnerElement.querySelectorAll(`[data-hotkey='${hotkey}']`);
      for (const el of elems) {
        el.click();
        dispatched = true;
      }

      // Prevent default on event if it has been handheld.
      if (dispatched) {
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
     * @param {{hotkey: string, callback: (hotkey:string)=>void, hint?: string}} sub
     * @returns {number} subscription token
     */
    function subscribe(sub) {
      const { hotkey, callback } = sub;
      // Validate some informations
      if (!hotkey || hotkey.length === 0) {
        throw new Error("You must specify an hotkey when registering a subscription.");
      }

      if (!callback || typeof callback !== "function") {
        throw new Error("You must specify a callback function when registering a subscription.");
      }

      /**
       * An hotkey must comply to these rules:
       *  - all parts are whitelisted
       *  - single key part comes last
       *  - each part is separated by the dash character: "-"
       */
      const keys = hotkey.split("-").filter((k) => !MODIFIERS.has(k));

      if (keys.some((k) => !AUTHORIZED_KEYS.has(k))) {
        throw new Error(
          `You are trying to subscribe for an hotkey ('${hotkey}')
            that contains parts not whitelisted: ${keys.join(", ")}`
        );
      } else if (keys.length > 1) {
        throw new Error(
          `You are trying to subscribe for an hotkey ('${hotkey}')
            that contains more than one single key part: ${keys.join("-")}`
        );
      }

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

    return {
      subscribe,
      unsubscribe,
    };
  },
};

serviceRegistry.add("hotkey", hotkeyService);
