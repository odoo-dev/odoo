import { Component, tags } from "@odoo/owl";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController } from "./abstract_controller";

const { xml } = tags;

class GraphRenderer extends Component<RendererProps, OdooEnv> {
  static template = xml`
      <div class="o_graph_renderer">
        <h2>Graph view</h2>

        <span><t t-esc="props.arch"/></span>
      </div>
    `;
}

class GraphController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: GraphRenderer };
}

export const GraphView: View = {
  name: "graph",
  icon: "fa-bar-chart",
  multiRecord: true,
  type: "graph",
  Component: GraphController,
  Renderer: GraphRenderer,
};
