import { Component, tags } from "@odoo/owl";
import { View } from "../types";
import { ControlPanel } from "../components/control_panel/control_panel";

const { xml } = tags;

class FormRenderer extends Component {
  static template = xml`
    <div>
        <ControlPanel/>
        <h2>Form view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>
    </div>
  `;
  static components = { ControlPanel };
}

export const FormView: View = {
  name: "form",
  type: "form",
  Component: FormRenderer,
};
