import { Component, tags } from "@odoo/owl";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController } from "./abstract_controller";

const { xml } = tags;

class PivotRenderer extends Component<RendererProps, OdooEnv> {
  static template = xml`
      <div class="o_pivot_renderer">
        <h2>Pivot view</h2>

        <span><t t-esc="props.arch"/></span>
      </div>
    `;
}

class PivotController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: PivotRenderer };
}

export const PivotView: View = {
  name: "pivot",
  icon: "fa-table",
  multiRecord: true,
  type: "pivot",
  Component: PivotController,
  Renderer: PivotRenderer,
};
