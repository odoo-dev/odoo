import { Component, tags, useState } from "@odoo/owl";
import { OdooEnv, FormRendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";
import { ActionMenus } from "./action_menus/action_menus";

import { useService } from "../core/hooks";
const { css, xml } = tags;

interface ControllerState {
  mode: "edit" | "readonly";
}

class FormRenderer extends Component<FormRendererProps, OdooEnv> {
  static template = xml`
    <div class="o_form_view" t-attf-class="{{props.mode === 'readonly' ? 'o_form_readonly' : 'o_form_editable'}}">
      <div class="o_form_sheet_bg">
        <div class="o_form_sheet">
          <div class="o_group">
            <table class="o_group o_inner_group o_group_col_6">
              <tbody>
                <tr>
                  <td class="o_td_label">ID</td>
                  <td><t t-esc="props.record and props.record.id"/></td>
                </tr>
                <tr>
                  <td class="o_td_label">Name</td>
                  <td><t t-esc="props.record and props.record.display_name"/></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  static style = css`
    .o_form_sheet_bg {
      border-bottom: 1px solid #ddd;
      background: url(/web/static/src/img/form_sheetbg.png);
      .o_form_sheet {
        margin: 12px auto;
        min-width: 650px;
        max-width: 1140px;
        min-height: 330px;
        padding: 24px;
        background: white;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        border: 1px solid #c8c8d3;
        .o_group {
          display: inline-block;
          width: 100%;
          margin: 10px 0;
          .o_td_label {
            border-right: 1px solid #ddd;
          }
          .o_td_label + td {
            padding: 0 36px 0 8px;
          }
        }
        .o_group.o_inner_group {
          display: inline-table;
        }
      }
    }
  `;
}

class FormController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: FormRenderer, ActionMenus };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.FormView.ControlPanelBottomLeft",
  };

  modelService = useService("model");
  state: ControllerState = useState({
    mode: "readonly",
  });
  record: any = null;

  async willStart() {
    await super.willStart();
    const fieldNames = ["id", "display_name"];
    if (this.props.recordId) {
      this.state.mode = "readonly";
      this.record = (
        await this.modelService(this.props.model).read([this.props.recordId], fieldNames)
      )[0];
    } else {
      this.state.mode = "edit";
    }
  }

  get actionMenusProps() {
    if (this.state.mode === "readonly") {
      return {
        selectedIds: [1, 2],
        items: {
          print: [
            {
              name: this.env._t("Print report"),
              callback: () => () => {},
            },
          ],
          action: [
            {
              name: this.env._t("Export"),
              callback: () => () => {},
            },
            {
              name: this.env._t("Archive"),
              callback: () => () => {},
            },
            {
              name: this.env._t("Delete"),
              callback: () => () => {},
            },
          ],
        },
      };
    }
  }
  get rendererProps(): FormRendererProps {
    return { ...super.rendererProps, mode: this.state.mode, record: this.record };
  }

  _onCreate() {
    this.state.mode = "edit";
  }
  _onDiscard() {
    this.state.mode = "readonly";
  }
  _onEdit() {
    this.state.mode = "edit";
  }
  _onSave() {
    this.state.mode = "readonly";
  }
}

export const FormView: View = {
  name: "form",
  icon: "fa-edit",
  multiRecord: false,
  type: "form",
  Component: FormController,
  Renderer: FormRenderer,
};
