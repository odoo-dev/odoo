import { Component, tags } from "@odoo/owl";
import { OdooEnv, ListRendererProps, View } from "../types";
import { AbstractController } from "./abstract_controller";
import { useService } from "../core/hooks";

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
    this.am.switchView("form", { recordId: id });
  }
}

class ListController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: ListRenderer };
  modelService = useService("model");
  records: any[] = [];
  fieldNames: string[] = [];

  async willStart() {
    await super.willStart();
    const fieldTypes = ["char", "text", "integer", "float", "many2one"];
    const fields = this.viewDescription.fields;
    this.fieldNames = Object.keys(fields).filter((fieldName: string) =>
      fieldTypes.includes(fields[fieldName].type)
    );
    const domain = this.props.domain;
    const context = this.props.context;
    const options = { limit: 80 };
    const model = this.modelService(this.props.model);
    this.records = (await model.searchRead(domain, this.fieldNames, options, context)) as any;
  }

  get rendererProps(): ListRendererProps {
    const props: any = super.rendererProps;
    props.fieldNames = this.fieldNames;
    props.records = this.records;
    return props;
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
