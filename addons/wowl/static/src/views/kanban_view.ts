import { Component, useState, tags } from "@odoo/owl";
import { useService } from "../core/hooks";
import { OdooEnv, RendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";
import { Pager, usePager } from "./pager";
import type { DBRecord } from "../services/model";

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
        background-color: #eee;
      }
    }
  `;
  static components = { KanbanRecord };
  am = useService("action_manager");

  _onClick(id: number) {
    this.am.switchView("form", { recordId: id });
  }
}

interface KanbanControllerState {
  records: DBRecord[];
}

class KanbanController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: KanbanRenderer, Pager };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.KanbanView.ControlPanelBottomLeft",
    bottomRight: "wowl.KanbanView.ControlPanelBottomRight",
  };

  modelService = useService("model");

  count: number = 0;
  state: KanbanControllerState = useState({
    records: [],
  });
  pager = usePager('pager', {
    limit: 5,
    onPagerChanged: this.onPagerChanged.bind(this),
  });

  async willStart() {
    await super.willStart();
    await this._loadRecords({ limit: this.pager.limit, offset: this.pager.currentMinimum - 1 });
  }

  async _loadRecords(options: any = {}) {
    const domain = this.props.domain;
    const context = this.props.context;
    const model = this.modelService(this.props.model);
    const result = await model.searchRead(domain, ["display_name"], options, context);
    this.pager.size = result.length;
    this.state.records = result.records;
  }

  get rendererProps(): any {
    const props: any = super.rendererProps;
    props.records = this.state.records;
    return props;
  }

  async onPagerChanged(currentMinimum: number, limit: number) {
    await this._loadRecords({ limit, offset: currentMinimum - 1 });
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
