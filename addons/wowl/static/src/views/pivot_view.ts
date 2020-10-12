import { Component, tags } from "@odoo/owl";
import { OdooEnv, View } from "../types";
import { ControlPanel } from "../components/control_panel/control_panel";

const { xml } = tags;

class PivotRenderer extends Component<{}, OdooEnv> {
  static template = xml`
    <div>
        <ControlPanel breadcrumbs="props.breadcrumbs" views="props.views"/>
        <h2>Pivot view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>
    </div>
  `;
  static components = { ControlPanel };
}

export const PivotView: View = {
  name: "pivot",
  icon: "fa-table",
  multiRecord: true,
  type: "pivot",
  Component: PivotRenderer,
};
