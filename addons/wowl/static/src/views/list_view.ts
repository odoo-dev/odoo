import { Component, tags } from "@odoo/owl";
import { OdooEnv, View } from "../types";
import { useService } from "../core/hooks";
import { ControlPanel } from "../components/control_panel/control_panel";

const { xml } = tags;

class ListRenderer extends Component<{}, OdooEnv> {
  static template = xml`
    <div>
        <ControlPanel breadcrumbs="props.breadcrumbs" views="props.views"/>
        <h2>List view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>

        <button t-on-click="_onRecordClicked"> Open Record </button>
    </div>
  `;
  static components = { ControlPanel };
  actionManager = useService("action_manager");

  _onRecordClicked() {
    this.actionManager.switchView("form");
  }
}

export const ListView: View = {
  name: "list",
  icon: "fa-list-ul",
  multiRecord: true,
  type: "list",
  Component: ListRenderer,
};
