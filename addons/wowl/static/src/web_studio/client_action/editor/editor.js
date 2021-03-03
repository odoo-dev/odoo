 /** @odoo-module **/

import { ActionContainer } from "@wowl/actions/action_container";
import { actionService } from "@wowl/actions/action_service";
import { useService } from "@wowl/core/hooks";

import { EditorMenu } from './editor_menu/editor_menu';
import ActionEditor from "web_studio.ActionEditor";
import { ActionEditorMain } from '../../legacy/action_editor_main';
import { EditorAdapter } from "./editor_adapter";

const { Component, core, hooks } = owl;

export class Editor extends Component {
  setup() {
    this.studio = useService("studio");

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

    this.ActionEditorMain = ActionEditorMain; // to remove
    this.ActionEditor = ActionEditor; // to remove
  }

  mounted() {
    // typically after an F5 in another tab than 'views', we must execute the
    // corresponding action (the ActionContainer must be instantiated)
    if (this.studio.editorTab !== "views") {
      this._executeAction(this.studio.editorTab);
    }
  }

  get key() {
      return `${this.studio.editedAction.id}/${this.studio.editedViewType}`;
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
    // const action = this.studio.getEditedAction();
    // return this.rpc('/web_studio/get_studio_action', {
    //   action_name: tab,
    //   model: action.res_model,
    //   view_id: action.view_id[0], // Not sure it is correct or desirable
    // });
  }

  async _executeAction(tab) {
    const action = await this.determineTabAction(tab);
    return this.actionManager.doAction(action, {
      clearBreadcrumbs: true,
    });
  }
}
Editor.template = "web_studio.Editor";
Editor.components = {
  EditorMenu,
  EditorAdapter, // to be replaced by ActionEditor
  ActionContainer,
};
