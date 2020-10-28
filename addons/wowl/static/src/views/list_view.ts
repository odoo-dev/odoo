import { Component, tags, useState } from "@odoo/owl";
import { OdooEnv, ListRendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";
import { useService } from "../core/hooks";
import { Pager, usePager } from "./pager";
import type { DBRecord } from "../services/model";

const { css, xml } = tags;

class ListRenderer extends Component<ListRendererProps, OdooEnv> {
  static template = xml`
    <div class="o_list_view">
      <div class="table-responsive">
        <table class="o_list_table table table-sm table-hover table-striped">
          <thead>
            <tr>
              <th class="o_list_record_selector"><input type="checkbox"/></th>
              <th t-foreach="props.fieldNames" t-as="fieldName" t-key="fieldName">
                <t t-esc="props.fields[fieldName].string"/>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr t-foreach="props.records" t-as="record" t-key="record.id" class="o_data_row" t-on-click="_onRowClicked(record.id)">
              <td class="o_list_record_selector"><input type="checkbox"/></td>
              <td t-foreach="props.fieldNames" t-as="fieldName" t-key="fieldName" class="o_data_cell">
                <t t-if="props.fields[fieldName].type === 'many2one'">
                  <t t-esc="record[fieldName] ? record[fieldName][1] : ''"/>
                </t>
                <t t-else="">
                  <t t-esc="record[fieldName] !== false ? record[fieldName] : ''"/>
                </t>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <td/>
            <td t-foreach="props.fieldNames" t-as="fieldName" t-key="fieldName"/>
          </tfoot>
        </table>
      </div>
    </div>
    `;
  static style = css`
    .o_list_view {
      .o_list_table {
        thead {
          background-color: #eee;
          color: #4c4c4c;
          border-bottom: 1px solid #cacaca;
        }
        th,
        .o_data_cell {
          font-size: 13px;
          white-space: nowrap;
          padding: 6px 3px;
        }
        .o_data_row {
          cursor: pointer;
        }
      }
    }
  `;

  am = useService("action_manager");

  _onRowClicked(id: number) {
    this.am.switchView("form", { recordId: id, recordIds: this.props.records.map((r) => r.id) });
  }
}

interface ListControllerState {
  records: DBRecord[];
}

class ListController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: ListRenderer, Pager };
  modelService = useService("model");
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomRight: "wowl.ListView.ControlPanelBottomRight",
  };
  state: ListControllerState = useState({
    records: [],
  });
  fieldNames: string[] = [];
  pager = usePager("pager", {
    limit: 5,
    onPagerChanged: this.onPagerChanged.bind(this),
  });

  async willStart() {
    await super.willStart();
    await this.loadRecords({ limit: this.pager.limit, offset: this.pager.currentMinimum - 1 });
  }

  async loadRecords(options: any = {}) {
    const fieldTypes = ["char", "text", "integer", "float", "many2one"];
    const fields = this.viewDescription.fields;
    this.fieldNames = Object.keys(fields).filter((fieldName: string) =>
      fieldTypes.includes(fields[fieldName].type)
    );
    const domain = this.props.domain;
    const context = this.props.context;
    const model = this.modelService(this.props.model);
    const result = await model.searchRead(domain, this.fieldNames, options, context);
    this.pager.size = result.length;
    this.state.records = result.records;
  }

  get rendererProps(): ListRendererProps {
    const props: any = super.rendererProps;
    props.fieldNames = this.fieldNames;
    props.records = this.state.records;
    return props;
  }

  async onPagerChanged(currentMinimum: number, limit: number) {
    await this.loadRecords({ limit, offset: currentMinimum - 1 });
    return {};
  }
}

export const ListView: View = {
  name: "list",
  icon: "fa-list-ul",
  multiRecord: true,
  type: "list",
  Component: ListController,
  Renderer: ListRenderer,
};
