import { Component } from "@odoo/owl";
import { useService } from "../core/hooks";
import { ActionRequest } from "../action_manager/action_manager";
import { ViewDefinition } from "../services/view_manager";
import { OdooEnv, ViewProps, ViewType } from "../types";

export interface SubTemplates {
  cpTopLeft: string | null;
  cpTopRight: string | null;
  cpBottomLeft: string | null;
  cpBottomRight: string | null;
  main: string | null;
}

export class BaseView extends Component<ViewProps, OdooEnv> {
  static template = "wowl.BaseView";
  templates: SubTemplates = {
    cpTopLeft: "wowl.Views.ControlPanelTopLeft",
    cpTopRight: null,
    cpBottomLeft: null,
    cpBottomRight: "wowl.Views.ControlPanelBottomRight",
    main: null,
  };

  vm = useService("view_manager");
  am = useService("action_manager");

  viewDescription: ViewDefinition = {} as any;

  async willStart() {
    const params = {
      model: this.props.model,
      views: this.props.views,
      context: this.props.context,
    };
    const options = {
      actionId: this.props.actionId,
      context: this.props.context,
      withActionMenus: this.props.withActionMenus,
      withFilters: this.props.withFilters,
    };
    const viewDescriptions = await this.vm.loadViews(params, options);
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
