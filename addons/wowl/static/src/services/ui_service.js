/** @odoo-module **/
import { useService } from "../core/hooks";
import { serviceRegistry } from "../webclient/service_registry";

const { Component, core, hooks } = owl;
const { EventBus } = core;
const { onMounted, onWillUnmount, useRef } = hooks;

/**
 * This hook will set the UI ownership
 * when the caller component will mount/unmount.
 *
 * The caller component could pass a `t-ref` value of its template
 * to delegate the UI ownership to another element than itself.
 * In that case, it is mandatory that the referenced element is fixed and
 * not dynamically attached in/detached from the DOM (e.g. with t-if directive).
 *
 * @param {string?} refName
 */
export function useUIOwnership(refName) {
  const uiService = useService("ui");
  const owner = refName ? useRef(refName) : Component.current;
  let uiOwnership = undefined;
  onMounted(() => {
    uiOwnership = uiService.takeOwnership(owner.el);
  });
  onWillUnmount(() => {
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
