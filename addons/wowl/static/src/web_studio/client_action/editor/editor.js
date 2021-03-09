 /** @odoo-module **/

import { ActionContainer } from "@wowl/actions/action_container";
import { actionService } from "@wowl/actions/action_service";
import { useService } from "@wowl/core/hooks";

import { EditorMenu } from './editor_menu/editor_menu';
import ActionEditor from "web_studio.ActionEditor";
import { ActionEditorMain } from '../../legacy/action_editor_main';
import { EditorAdapter } from "./editor_adapter";

import { ReportEditor } from './report_editor_adapter';

const { Component, core, hooks } = owl;


const actionServiceStudio = {
  name: 'action',
  dependencies: ['studio'],
  deploy(env) {
    const action = actionService.deploy(env);
    const _doAction = action.doAction;

    function doAction(actionRequest, options) {
      if (actionRequest === "web_studio.action_edit_report") {
        env.services.studio.setParams({ editorTab: 'reports', editedReport: options.report });
        return;
      }
      return _doAction(...arguments);
    }

    return Object.assign(action, { doAction });
  }
};


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
    // Assuming synchronousness
    this.env.services.action = actionServiceStudio.deploy(this.env);
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
    let action = 22;
    if (tab === 'reports') {
      const _action = this.studio.editedAction;
      action = lpeReportAction(_action.res_model);
    }
    return action;
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
  ReportEditor,
};


function lpeReportAction(model) {
  return {
    'name': _('Reports'),
    'type': 'ir.actions.act_window',
    'res_model': 'ir.actions.report',
    'views': [[false, 'kanban'], [false, 'form']],
    'target': 'current',
    'context': {
        'default_model': model,
        'search_default_model': model,
    },
  };
}
