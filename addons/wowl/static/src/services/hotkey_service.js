/** @odoo-module **/
import { useService } from "../core/hooks";
import { serviceRegistry } from "../webclient/service_registry";
const { hooks } = owl;
const { onMounted, onWillUnmount } = hooks;

/**
 * This hook will register/unregister the given registration
 * when the caller component will mount/unmount.
 *
 * @param {string} hotkey
 * @param {()=>void} callback
 * @param {Object} options - additional options
 * @param {boolean} options.allowInEditable - allow registration to perform even in editable element
 * @param {boolean} options.allowRepeat
 *    allow registration to perform multiple times when hotkey is held down
 */
export function useHotkey(hotkey, callback, options = {}) {
  const hotkeyService = useService("hotkey");
  let token;
  onMounted(() => {
    token = hotkeyService.registerHotkey(hotkey, callback, options);
  });
  onWillUnmount(() => {
    hotkeyService.unregisterHotkey(token);
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
    const { ui } = env.services;
    const registrations = new Map();
    let nextToken = 0;

    window.addEventListener("keydown", onKeydown);

    /**
     * Handler for keydown events.
     * Verifies if the keyboard event can be dispatched or not.
     * Rules sequence to forbid dispatching :
     * - UI is blocked
     * - the pressed key is not whitelisted
     *
     * @param {KeyboardEvent} ev
     */
    function onKeydown(event) {
      const hotkey = getActiveHotkey(event);

      // Do not dispatch if UI is blocked
      if (ui.isBlocked) {
        return;
      }

      // FIXME : this is a temporary hack. It forces [aria-keyshortcuts] on all [accesskey] elements.
      const elementsWithoutAriaKeyshortcut = ui.getVisibleElements('[accesskey]:not([aria-keyshortcuts])');
      for (const el of elementsWithoutAriaKeyshortcut) {
        el.setAttribute('aria-keyshortcuts', el.accessKey);
      }

      // Is the pressed key NOT whitelisted ?
      const singleKey = hotkey.split("+").pop();
      if (!AUTHORIZED_KEYS.has(singleKey)) {
        return;
      }

      // Finally, prepare and dispatch.
      const focusedElement = document.activeElement;
      const focusedTagName = focusedElement ? focusedElement.tagName : "";
      const inEditableElement =
        focusedElement && (focusedElement.isContentEditable ||
          ["INPUT", "TEXTAREA"].includes(focusedTagName));
      const infos = {
        hotkey,
        inEditableElement,
        _originalEvent: event,
      };
      dispatch(infos);
    }

    /**
     * Dispatches an hotkey to all matching registrations and
     * clicks on all elements having a aria-keyshortcuts attribute matching the hotkey.
     *
     * @param {{
     *  hotkey: string,
     *  inEditableElement: boolean,
     *  _originalEvent: KeyboardEvent
     * }} infos
     */
    function dispatch(infos) {
      let dispatched = false;
      const { hotkey, inEditableElement, _originalEvent: event } = infos;
      const isAlted = event.altKey;
      const activeElement = ui.activeElement;

      // Dispatch actual hotkey to all matching registrations
      for (const [_, reg] of registrations) {

        if (reg.activeElement !== activeElement) {
          continue;
        }

        if (reg.hotkey.toLowerCase() !== hotkey) {
          continue;
        }

        if (!reg.allowInEditable && inEditableElement && !isAlted) {
          continue;
        }

        if (!reg.allowRepeat && event.repeat) {
          continue;
        }

        reg.callback();
        dispatched = true;
      }

      if (!event.repeat && (!inEditableElement || isAlted)) {
        // Click on all elements having a aria-keyshortcuts attribute matching the actual hotkey.
        const elems = activeElement.querySelectorAll(`[aria-keyshortcuts~='${hotkey}' i]`);
        for (const el of elems) {
          // AAB: not sure it is enough, we might need to trigger all events that occur when you actually click
          el.focus();
          el.click();
          dispatched = true;
        }
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
     * @returns {string} the active hotkey, in lowercase
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

      return hotkey.join("+").toLowerCase();
    }

    /**
     * Registers a new hotkey.
     *
     * @param {string} hotkey
     * @param {()=>void} callback
     * @param {Object} options - additional options
     * @param {boolean} options.allowInEditable - allow registration to perform even in editable element
     * @param {boolean} options.allowRepeat
     *    allow registration to perform multiple times when hotkey is held down
     * @returns {number} registration token
     */
    function registerHotkey(hotkey, callback, options = {}) {
      // Validate some informations
      if (!hotkey || hotkey.length === 0) {
        throw new Error("You must specify an hotkey when registering a registration.");
      }

      if (!callback || typeof callback !== "function") {
        throw new Error("You must specify a callback function when registering a registration.");
      }

      /**
       * An hotkey must comply to these rules:
       *  - all parts are whitelisted
       *  - single key part comes last
       *  - each part is separated by the dash character: "+"
       */
      const keys = hotkey.toLowerCase().split("+").filter((k) => !MODIFIERS.has(k));
      if (keys.some((k) => !AUTHORIZED_KEYS.has(k))) {
        throw new Error(
          `You are trying to subscribe for an hotkey ('${hotkey}')
            that contains parts not whitelisted: ${keys.join(", ")}`
        );
      } else if (keys.length > 1) {
        throw new Error(
          `You are trying to subscribe for an hotkey ('${hotkey}')
            that contains more than one single key part: ${keys.join("+")}`
        );
      }

      // Add registration
      const token = nextToken++;
      const registration = {
        hotkey,
        callback,
        activeElement: null,
        allowInEditable: options && options.allowInEditable,
        allowRepeat: options && options.allowRepeat,
      };
      registrations.set(token, registration);

      // Due to the way elements are mounted in the DOM by Owl (bottom-to-top),
      // we need to wait the next micro task tick to set the context owner of the registration.
      Promise.resolve().then(() => {
        registration.activeElement = ui.activeElement;
      });

      return token;
    }

    /**
     * Unsubscribes the token corresponding registration.
     *
     * @param {number} token
     */
    function unregisterHotkey(token) {
      registrations.delete(token);
    }

    return {
      registerHotkey,
      unregisterHotkey,
    };
  },
};

serviceRegistry.add("hotkey", hotkeyService);
