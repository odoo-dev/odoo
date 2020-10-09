import { Component, tags } from "@odoo/owl";
import { OdooEnv, View } from "../types";
import { ControlPanel } from "../components/control_panel/control_panel";

const { xml } = tags;

class ListRenderer extends Component<{}, OdooEnv> {
  static template = xml`
    <div>
        <ControlPanel/>
        <h2>List view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>
    </div>
  `;
  static components = { ControlPanel };
}

export const ListView: View = {
  name: "list",
  type: "list",
  Component: ListRenderer,
};
