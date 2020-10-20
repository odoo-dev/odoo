import { Component, tags } from "@odoo/owl";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController } from "./abstract_controller";

const { xml } = tags;

class ListRenderer extends Component<RendererProps, OdooEnv> {
  static template = xml`
      <div class="o_list_renderer">
        <h2>List view</h2>

        <span><t t-esc="props.arch"/></span>
      </div>
    `;
}

class ListController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: ListRenderer };
}

export const ListView: View = {
  name: "list",
  icon: "fa-list-ul",
  multiRecord: true,
  type: "list",
  Component: ListController,
  Renderer: ListRenderer,
};
