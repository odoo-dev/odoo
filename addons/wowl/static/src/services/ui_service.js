/** @odoo-module **/
import { useService } from "../core/hooks";
import { serviceRegistry } from "../webclient/service_registry";

const { Component, core, hooks } = owl;
const { EventBus } = core;

/**
 * This hook will set the UI ownership
 * when the caller component will mount/unmount.
 * The caller component could pass a `t-ref` value of its template
 * to delegate the UI ownership to another element than itself.
 *
 * @param {string?} refName
 */
export function useUIOwnership(refName) {
  const uiService = useService("ui");
  const owner = (refName && hooks.useRef(refName)) || Component.current;
  let uiOwnership = undefined;
  hooks.onMounted(() => {
    uiOwnership = uiService.takeOwnership(owner.el);
  });
  hooks.onWillUnmount(() => {
    uiOwnership.release();
  });
}

export const uiService = {
  name: "ui",
  deploy(env) {
    const bus = new EventBus();

    let blockCount = 0;
    function block() {
      blockCount++;
      if (blockCount === 1) {
        bus.trigger("BLOCK");
      }
    }
    function unblock() {
      blockCount = Math.max(0, blockCount - 1);
      if (blockCount === 0) {
        bus.trigger("UNBLOCK");
      }
    }

    let ownerStack = [document];
    function takeOwnership(owner) {
      ownerStack.push(owner);
      return {
        release() {
          ownerStack = ownerStack.filter(x => x !== owner);
        }
      };
    }
    function getOwner() {
      return ownerStack[ownerStack.length - 1];
    }

    return {
      bus,
      block,
      unblock,
      get isBlocked() {
        return blockCount > 0
      },
      getOwner,
      takeOwnership,
    }
  },
};

serviceRegistry.add("ui", uiService);
