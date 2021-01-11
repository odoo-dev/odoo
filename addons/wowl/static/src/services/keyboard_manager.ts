import { Component, core, hooks } from "@odoo/owl";
import { Callback, OdooEnv, Service } from "../types";

const bus = new core.EventBus();

const isVisibleHTMLElement = (el: HTMLElement) => el.offsetHeight > 0 && el.offsetWidth > 0;

/**
 * This hook should be used by components when they want
 * to automatically register their elements accesskey attributes.
 */
export function useKeyNav() {
  // BOI: just an idea I may explore later...
  const component = Component.current! as Component<any, OdooEnv>;

  // Ensure keyboard manager service is available
  if (!component.env.services["keyboard_manager"]) {
    throw new Error("Keyboard manager service not deployed.");
  }

  function subscribeAccesskeyElements() {
    if (component.el) {
      [...component.el.querySelectorAll<HTMLElement>("[accesskey]")]
        .filter(isVisibleHTMLElement)
        .forEach((el) => {
          const accesskey = el.getAttribute("accesskey")!.toUpperCase();
          bus.trigger("subscribe", { owner: component, key: accesskey, target: el });
        });
    }
  }

  function unsubscribe() {
    bus.trigger("unsubscribe", { owner: component });
  }

  hooks.onMounted(subscribeAccesskeyElements);
  hooks.onPatched(() => {
    unsubscribe();
    subscribeAccesskeyElements();
  });
  hooks.onWillUnmount(unsubscribe);

  return {
    notice: (cb: Callback) => {
      bus.on("notify", component, (args) => {
        if (args.owner === component) {
          cb();
        }
      });
    },
  };
}

interface KeyboardManagerService {}

const FLUSH_DELAY = 1000;
export const keyboardManagerService: Service<KeyboardManagerService> = {
  name: "keyboard_manager",
  deploy(): KeyboardManagerService {
    let flushTimer: number | undefined;
    const keysBuffer: any = {};

    function registerKeydown(ev: KeyboardEvent) {
      keysBuffer[ev.key] = {
        key: ev.key,
        modifiers: {
          alt: ev.altKey,
          ctrl: ev.ctrlKey,
          shift: ev.shiftKey,
        },
      };
      bus.trigger("new", keysBuffer);
      resetAutoFlush();
    }

    function resetAutoFlush() {
      odoo.browser.clearTimeout(flushTimer);
      flushTimer = odoo.browser.setTimeout(flush, FLUSH_DELAY);
    }

    function flush() {
      console.log("flushing", keysBuffer);
      Object.keys(keysBuffer).forEach((k) => {
        console.log("delete", keysBuffer[k]);
        delete keysBuffer[k];
      });
      console.log("flushed", keysBuffer);
      odoo.browser.clearTimeout(flushTimer);
    }

    window.addEventListener("keydown", registerKeydown);
    return {};
  },
};
