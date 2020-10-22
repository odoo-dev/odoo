import { Component } from "@odoo/owl";
import { OdooEnv, RendererProps, ViewProps, ViewType } from "../types";
import { useService } from "../core/hooks";
import type { ViewDefinition } from "./../services/view_manager";
import { ActionRequest } from "../services/action_manager/action_manager";

export interface ControlPanelSubTemplates {
  topLeft: string | null;
  topRight: string | null;
  bottomLeft: string | null;
  bottomRight: string | null;
}

export class AbstractController extends Component<ViewProps, OdooEnv> {
  static template = "wowl.AbstractController";
  static props = {
    // TODO
  };

  cpSubTemplates: ControlPanelSubTemplates = {
    topLeft: "wowl.Views.ControlPanelTopLeft",
    topRight: null,
    bottomLeft: null,
    bottomRight: "wowl.Views.ControlPanelBottomRight",
  };

  vm = useService("view_manager");
  am = useService("action_manager");
  viewDescription: ViewDefinition = {} as any;

  get rendererProps(): RendererProps {
    return {
      arch: (this.viewDescription as ViewDefinition).arch,
      model: this.props.model,
      fields: (this.viewDescription as ViewDefinition).fields,
    };
  }

  async willStart() {
    const options = {
      actionId: this.props.options.actionId,
      withActionMenus: this.props.options.withActionMenus,
      withFilters: this.props.options.withFilters,
    };
    const viewDescriptions = await this.vm.loadViews(this.props.model, this.props.views, options);
    this.viewDescription = viewDescriptions[this.props.type];
  }

  /**
   * Called when an element of the breadcrumbs is clicked.
   *
   * @param {string} jsId
   */
  onBreadcrumbClicked(jsId: string) {
    this.am.restore(jsId);
  }
  /**
   * Called when a view is clicked in the view switcher.
   *
   * @param {ViewType} viewType
   */
  onViewClicked(viewType: ViewType) {
    this.am.switchView(viewType);
  }

  // Demo code (move to kanban)
  _onExecuteAction(action: ActionRequest) {
    this.am.doAction(action);
  }
  _onOpenFormView() {
    if (this.props.type !== "form") {
      this.am.switchView("form");
    }
  }
}
