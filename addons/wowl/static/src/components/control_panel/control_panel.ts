import { Component } from "@odoo/owl";
import { useService } from "../../core/hooks";

export class ControlPanel extends Component {
  static template = "wowl.ControlPanel";
  actionManager = useService("action_manager");

  get breadcrumbs() {
    return this.actionManager.getBreadcrumbs();
  }

  _onBreadcrumbClicked(jsId: string) {
    this.actionManager.restore(jsId);
  }
  _onExecuteAction(actionId: number) {
    this.actionManager.doAction(actionId);
  }
}
