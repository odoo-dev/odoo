import { Component, tags } from "@odoo/owl";
import { View } from "./types";
const { xml } = tags;

class FormRenderer extends Component {
  static template = xml`
    <div>
        <h2>Form view</h2>

        <span>Model: <b><t t-esc="props.action.res_model"/></b></span>
    </div>
  `;
}

export const FormView: View = {
  name: "form",
  type: "form",
  Component: FormRenderer,
};
