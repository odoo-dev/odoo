import { Component, tags, useState } from "@odoo/owl";
import { OdooEnv, FormRendererProps, View } from "../types";
import { AbstractController, ControlPanelSubTemplates } from "./abstract_controller";
import { ActionMenus } from "./action_menus/action_menus";
import { Pager, usePager } from "./pager";
import type { DBRecord, ModelBuilder } from "../services/model";

import { useService } from "../core/hooks";
import { ViewDefinition } from "../services/view_manager";
const { xml } = tags;

interface FormControllerState {
  mode: "edit" | "readonly";
  record: DBRecord | null;
}

class FormRenderer extends Component<FormRendererProps, OdooEnv> {
  static template = xml`<t t-call="{{_template}}"/>`;

  static nextId = 1;

  _template: string;

  constructor(parent: any, props: FormRendererProps) {
    super(parent, props);
    const name = `__form__${FormRenderer.nextId++}`;
    const template = compileFormTemplate(props.arch, name);
    this.env.qweb.addTemplates(template);
    this._template = name;
  }
}

function compileFormTemplate(arch: string, name: string): Document {
  const parser = new DOMParser();
  const xml = parser.parseFromString(arch, "text/xml");
  const document = parser.parseFromString("<templates />", "text/xml");
  const tTag = document.createElement("t");
  tTag.setAttribute("t-name", name);
  document.documentElement.appendChild(tTag);
  let isInGroup = false;

  generateQWeb(xml.documentElement, tTag);

  function generateQWeb(node: Element | ChildNode, parent: Element) {
    if (!(node instanceof Element)) {
      parent.appendChild(document.createTextNode(node.textContent!));
      return;
    }
    if (node.nodeType === 1) {
      // standard tag
      switch (node.tagName) {
        case "form":
          const form = document.createElement("div");
          form.setAttribute(`class`, "o_form_view");
          form.setAttribute(
            `t-attf-class`,
            "{{props.mode === 'readonly' ? 'o_form_readonly' : 'o_form_editable'}}"
          );
          parent.appendChild(form);
          for (let child of node.childNodes) {
            generateQWeb(child, form);
          }
          break;
        case "sheet":
          const sheetBG = document.createElement("div");
          sheetBG.setAttribute("class", "o_form_sheet_bg");
          parent.appendChild(sheetBG);
          const sheetFG = document.createElement("div");
          sheetFG.setAttribute("class", "o_form_sheet");
          sheetBG.appendChild(sheetFG);
          for (let child of node.childNodes) {
            generateQWeb(child, sheetFG);
          }
          break;
        case "group":
          if (!isInGroup) {
            const group = document.createElement("div");
            group.setAttribute("class", "o_group");
            parent.appendChild(group);
            isInGroup = true;
            for (let child of node.childNodes) {
              generateQWeb(child, group);
            }
            isInGroup = false;
          } else {
            const table = document.createElement("table");
            table.setAttribute("class", "o_group o_inner_group o_group_col_6");
            parent.appendChild(table);
            const tbody = document.createElement("tbody");
            table.appendChild(tbody);
            for (let child of node.childNodes) {
              const tr = document.createElement("tr");
              tbody.appendChild(tr);
              generateQWeb(child, tr);
            }
          }
          break;
        case "field":
          if (node.getAttribute("invisible") === "1") {
            break;
          }
          const field = document.createElement("t");
          field.setAttribute("t-esc", `props.record['${node.getAttribute("name")}']`);
          parent.appendChild(field);
          break;
        default:
          const elem = document.createElement(node.tagName);
          if (node.hasAttribute("class")) {
            elem.setAttribute("class", node.getAttribute("class")!);
          }
          parent.appendChild(elem);
          for (let child of node.childNodes) {
            generateQWeb(child, elem);
          }
      }
    }
  }
  return document;
}

class RelationalModel {
  model: ModelBuilder;
  modelName: string;
  viewDef: () => ViewDefinition;

  constructor(model: ModelBuilder, modelName: string, viewDef: () => ViewDefinition) {
    this.model = model;
    this.modelName = modelName;
    this.viewDef = viewDef;
  }

  async load(id: number): Promise<DBRecord> {
    const view = this.viewDef();
    const { fields } = view;
    const records = await this.model(this.modelName).read([id], Object.keys(fields));
    return records[0];
  }
}

function useRelationalModel(model: string, viewDefinition: () => ViewDefinition) {
  const modelService = useService("model");
  return new RelationalModel(modelService, model, viewDefinition);
}

class FormController extends AbstractController {
  static components = {
    ...AbstractController.components,
    Renderer: FormRenderer,
    ActionMenus,
    Pager,
  };
  cpSubTemplates: ControlPanelSubTemplates = {
    ...this.cpSubTemplates,
    bottomLeft: "wowl.FormView.ControlPanelBottomLeft",
    bottomRight: "wowl.FormView.ControlPanelBottomRight",
  };
  static props = {
    recordId: { type: Number, optional: true },
    recordIds: { type: Array, element: Number, optional: true },
  };
  static defaultProps = {
    recordIds: [],
  };

  dataModel = useRelationalModel(this.props.model, () => this.viewDescription);

  state: FormControllerState = useState({
    mode: "readonly",
    record: null,
  });
  pager = usePager("pager", {
    currentMinimum: this.props.recordId
      ? this.props.recordIds!.indexOf(this.props.recordId) + 1
      : 0,
    limit: 1,
    size: this.props.recordIds!.length,
    onPagerChanged: this.onPagerChanged.bind(this),
  });

  async willStart() {
    await super.willStart();
    if (this.props.recordId) {
      this.state.mode = "readonly";
      return this.loadRecord(this.props.recordId);
    } else {
      this.state.mode = "edit";
    }
  }

  async loadRecord(id: number) {
    this.state.record = await this.dataModel.load(id);
  }

  get actionMenusProps() {
    if (this.state.mode === "readonly") {
      return {
        selectedIds: [1, 2],
        items: {
          print: [
            {
              name: this.env._t("Print report"),
              id: 1,
              callback: () => () => {},
            },
          ],
          action: [
            {
              name: this.env._t("Export"),
              id: 1,
              callback: () => () => {},
            },
            {
              name: this.env._t("Archive"),
              id: 2,
              callback: () => () => {},
            },
            {
              name: this.env._t("Delete"),
              id: 3,
              callback: () => () => {},
            },
          ],
        },
      };
    }
  }
  get rendererProps(): FormRendererProps {
    return { ...super.rendererProps, mode: this.state.mode, record: this.state.record };
  }

  async onPagerChanged(currentMinimum: number, limit: number) {
    await this.loadRecord(this.props.recordIds![currentMinimum - 1]);
    return {};
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
