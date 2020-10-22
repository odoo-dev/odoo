import { Component, tags } from "@odoo/owl";
import { useService } from "../core/hooks";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";

const { xml, css } = tags;

class KanbanRecord extends Component {
  static template = xml`
    <div class="o_kanban_record">
      <t t-esc="props.record.display_name"/>
    </div>
    `;
}
class KanbanRenderer extends Component<RendererProps, OdooEnv> {
  static template = xml`
      <div class="o_kanban_renderer">
        <t t-foreach="props.records" t-as="record" t-key="record.id">
          <KanbanRecord record="record" t-on-click="_onClick(record.id)"/>
        </t>
      </div>
    `;
  static style = css`
    .o_kanban_renderer {
      display: flex;
      flex-wrap: wrap;
    }
    .o_kanban_record {
      border: 1px solid gray;
      width: 200px;
      height: 80px;
      margin: 5px;
      cursor: pointer;

      &:hover {
        background-color: #EEE;
      }
    }`
  static components = { KanbanRecord };
  am = useService('action_manager');

  _onClick(id: number) {
    this.am.switchView('form', { recordId: id });
  }
}

class KanbanController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: KanbanRenderer };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.KanbanView.ControlPanelBottomLeft",
  };
  modelService = useService('model');
  records: any[] = [];

  async willStart() {
    await super.willStart();
    const fieldTypes = ["char", "text", "integer", "float", "many2one"];
    const fields = this.viewDescription.fields;
    const fieldNames = Object.keys(fields).filter((fieldName: string) => fieldTypes.includes(fields[fieldName].type));
    this.records = await this.modelService(this.props.model).searchRead([], fieldNames, { limit: 80 }) as any;
  }

  get rendererProps(): any {
    const props: any = super.rendererProps;
    props.records = this.records;
    return props;
  }
}

export const KanbanView: View = {
  name: "kanban",
  icon: "fa-th-large",
  multiRecord: true,
  type: "kanban",
  Component: KanbanController,
  Renderer: KanbanRenderer,
};
