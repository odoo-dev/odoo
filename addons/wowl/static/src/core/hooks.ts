import { Component, hooks } from "@odoo/owl";
import { OdooEnv, Services } from "../types";

// -----------------------------------------------------------------------------
// Hook function
// -----------------------------------------------------------------------------
export function useService<T extends keyof Services>(serviceName: T): Services[T] {
  const component = Component.current as Component<any, OdooEnv>;
  const env = component.env;
  const service = env.services[serviceName];
  if (!service) {
    throw new Error(`Service ${serviceName} is not available`);
  }
  return typeof service === "function" ? service.bind(component) : service;
}

interface UseAutofocusParams {
  selector?: string;
}

/**
 * Focus a given selector as soon as it appears in the DOM and if it was not
 * displayed before. If the selected target is an input|textarea, set the selection
 * at the end.
 * @param {Object} [params]
 * @param {string} [params.selector='autofocus'] default: select the first element
 *                 with an `autofocus` attribute.
 * @returns {Function} function that forces the focus on the next update if visible.
 */
export function useAutofocus(params: UseAutofocusParams = {}) {
  const comp: Component = Component.current!;
  // Prevent autofocus in mobile
  // FIXME: device not yet available in the env
  // if (comp.env.device.isMobile) {
  //     return () => {};
  // }
  const selector = params.selector || "[autofocus]";
  let target: HTMLElement | null = null;
  function autofocus() {
    const prevTarget = target;
    target = comp.el!.querySelector(selector);
    if (target && target !== prevTarget) {
      target.focus();
      if (["INPUT", "TEXTAREA"].includes(target.tagName)) {
        const inputEl = target as HTMLInputElement;
        inputEl.selectionStart = inputEl.selectionEnd = inputEl.value.length;
      }
    }
  }
  hooks.onMounted(autofocus);
  hooks.onPatched(autofocus);

  return function focusOnUpdate() {
    target = null;
  };
}
