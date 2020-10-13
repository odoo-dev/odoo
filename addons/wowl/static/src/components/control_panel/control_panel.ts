import { Component } from "@odoo/owl";
import { useService } from "../../core/hooks";

export class ControlPanel extends Component {
  static template = "wowl.ControlPanel";
  static defaultProps = {
    breadcrumbs: [],
    views: [],
  };
  actionManager = useService("action_manager");

  _onBreadcrumbClicked(jsId: string) {
    this.actionManager.restore(jsId);
  }
  _onViewClicked(viewType: string) {
    this.actionManager.switchView(viewType);
  }

  // Demo code
  _onExecuteAction(action: any) {
    this.actionManager.doAction(action);
  }
}
