import { Component, tags } from "@odoo/owl";
import { OdooEnv, View } from "../types";
import { ControlPanel } from "../components/control_panel/control_panel";

const { xml } = tags;

class KanbanRenderer extends Component<{}, OdooEnv> {
  static template = xml`
    <div>
        <ControlPanel breadcrumbs="props.breadcrumbs" views="props.views"/>
        <h2>Kanban view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>
    </div>
  `;
  static components = { ControlPanel };
}

export const KanbanView: View = {
  name: "kanban",
  icon: "fa-th-large",
  multiRecord: true,
  type: "kanban",
  Component: KanbanRenderer,
};
