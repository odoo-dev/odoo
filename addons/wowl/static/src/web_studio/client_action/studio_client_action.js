 /** @odoo-module **/
import { actionService } from "@wowl/actions/action_service";
import { ActionContainer } from "@wowl/actions/action_container";
import { actionRegistry } from "@wowl/actions/action_registry";
import { ComponentAdapter } from "web.OwlCompatibility";
import { computeHomeMenuProps } from "@wowl/web_enterprise/webclient/home_menu/home_menu_service";
import { useService } from "@wowl/core/hooks";

import { EditorMenu } from './editor/editor_menu/editor_menu';
import { StudioNavbar } from "./navbar/navbar";
import ActionEditor from "web_studio.ActionEditor";
import { ActionEditorMain } from '../legacy/action_editor_main';
import { EditorAdapter } from "./editor/editor_adapter";
import { AppCreatorWrapper } from "./app_creator/app_creator";
import { StudioHomeMenu } from "./studio_home_menu/studio_home_menu";

const { Component, core, hooks } = owl;

class StudioClientAction extends Component {
  setup() {
    this.studio = useService("studio");
    this.menus = useService("menu");
    this.homeMenuProps = computeHomeMenuProps(this.menus.getMenuAsTree("root"));

    hooks.useSubEnv({
      bus: new core.EventBus(),
      studioEnv: true, // just to help us, can be removed before merging
    });
    this.env.services = Object.assign({}, this.env.services);
    this.env.services.router = {
      pushState() {},
    };
    this.env.services.action = actionService.deploy(this.env);

    this.actionManager = useService("action");
    this.studio = useService("studio");

    this.AppCreatorWrapper = AppCreatorWrapper; // to remove
    this.ActionEditorMain = ActionEditorMain; // to remove
    this.ActionEditor = ActionEditor; // to remove
  }

  willStart() {
    return this.studio.ready;
  }

  mounted() {
    this.studio.pushState();
    this.studio.bus.on("UPDATE", this, this.render);
    document.body.classList.add("o_in_studio"); // FIXME ?

    // typically after an F5 in another tab than 'views', we must execute the
    // corresponding action (the ActionContainer must be instantiated)
    if (this.studio.editorTab !== "views") {
      this._executeAction(this.studio.editorTab);
    }
  }

  patched() {
    this.studio.pushState();
  }

  willUnmount() {
    this.studio.bus.off("UPDATE", this);
    document.body.classList.remove("o_in_studio");
  }

  get key() {
      return `${this.studio.editedAction.id}/${this.studio.editedViewType}`;
  }

  catchError(error) {
    debugger;
  }

  switchView(ev) {
    const { viewType } = ev.detail;
    this.studio.setParams({ viewType, editorTab: 'views' });
  }
  switchViewLegacy(ev) {
    this.studio.setParams({ viewType: ev.detail.view_type });
  }

  async onSwitchTab(ev) {
    const { tab } = ev.detail;
    if (tab === 'views') {
        this.studio.setParams({ editorTab: "views" });
        // empty the action container
        this.env.bus.trigger("ACTION_MANAGER:UPDATE", { type: "MAIN" });
    } else {
        await this._executeAction(tab);
        this.studio.setParams({ editorTab: tab });
    }
  }

  determineTabAction(tab) {
    return tab === "reports" ? 6 : 22; // LPE fixme: remove me, obviously
    const action = this.studio.getEditedAction();
    return this.rpc('/web_studio/get_studio_action', {
      action_name: tab,
      model: action.res_model,
      view_id: action.view_id[0], // Not sure it is correct or desirable
    });
  }

  async _executeAction(tab) {
    const action = await this.determineTabAction(tab);
    return this.actionManager.doAction(action, {
      clearBreadcrumbs: true,
    });
  }
}
StudioClientAction.template = "web_studio.StudioClientAction";
StudioClientAction.components = {
  StudioNavbar,
  StudioHomeMenu,
  ComponentAdapter, // to be replaced by AppCreator
  EditorMenu,
  EditorAdapter, // to be replaced by ActionEditor
  ActionContainer,
};
StudioClientAction.forceFullscreen = true;

actionRegistry.add("studio", StudioClientAction);
