import { Component, tags, useState } from "@odoo/owl";
import { OdooEnv, FormRendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";
import { ActionMenus } from "./action_menus/action_menus";

const { xml } = tags;

interface ControllerState {
  mode: "edit" | "readonly";
}

class FormRenderer extends Component<FormRendererProps, OdooEnv> {
  static template = xml`
    <div class="o_form_renderer">
      <h2>Form view (<t t-esc="props.mode"/>)</h2>

      <span><t t-esc="props.arch"/></span>
    </div>
  `;
}

class FormController extends AbstractController {
  static components = { ...AbstractController.components, Renderer: FormRenderer, ActionMenus };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.FormView.ControlPanelBottomLeft",
  };

  state: ControllerState = useState({
    mode: "readonly",
  });

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
    return { ...super.rendererProps, mode: this.state.mode };
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
