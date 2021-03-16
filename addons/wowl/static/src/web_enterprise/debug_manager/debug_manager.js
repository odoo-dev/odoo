/** @odoo-module **/

import { DebugManager } from "../../debug/debug_manager";
import { useService } from "../../core/hooks";

export class EnterpriseDebugManager extends DebugManager {
  constructor() {
    super(...arguments);
    this.hm = useService("home_menu");
  }
  getElements() {
    if (this.hm.hasHomeMenu) {
      const __debugFactories__ = this.debugFactories;
      this.debugFactories = { global: this.debugFactories.global };
      const elems = super.getElements();
      this.debugFactories = __debugFactories__;
      return elems;
    }
    return super.getElements();
  }
}
