import { Component, tags } from "@odoo/owl";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";

const { xml } = tags;

class KanbanRenderer extends Component<RendererProps, OdooEnv> {
  static template = xml`
      <div class="o_kanban_renderer">
        <h2>Kanban view</h2>

        <span><t t-esc="props.arch"/></span>
      </div>
    `;
}

class KanbanController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: KanbanRenderer };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.KanbanView.ControlPanelBottomLeft",
  };
}

export const KanbanView: View = {
  name: "kanban",
  icon: "fa-th-large",
  multiRecord: true,
  type: "kanban",
  Component: KanbanController,
  Renderer: KanbanRenderer,
};
