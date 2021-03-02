/** @odoo-module **/
import { actionService } from "@wowl/actions/action_service";
import { ActionContainer } from "@wowl/actions/action_container";
import { useService } from "@wowl/core/hooks";

const { Component, core, hooks } = owl;

export class ActionEditor extends Component {
  constructor() {
    super(...arguments);
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
  }

  mounted() {
    // typically after an F5 in another tab than 'views', we must execute the
    // corresponding action (the ActionContainer must be instantiated)
    if (this.studio.editorTab !== "views") {
      this._executeAction(this.studio.editorTab);
    }
  }

  async openTab(tab) {
    switch (tab) {
      case "views":
        this.studio.setParams({ editorTab: "views" });
        // empty the action container
        this.env.bus.trigger("ACTION_MANAGER:UPDATE", { type: "MAIN" });
        break;
      case "reports":
      case "access_rights":
        await this._executeAction(tab);
        this.studio.setParams({ editorTab: tab });
    }
  }

  _executeAction(tab) {
    // FIXME: call get_studio_action to get the action to execute
    return this.actionManager.doAction(tab === "reports" ? 6 : 22, {
      clearBreadcrumbs: true,
    });
  }

  switchView(viewType) {
    this.studio.setParams({ viewType });
  }
}
ActionEditor.template = "web_studio.ActionEditor";
ActionEditor.components = {
  ActionContainer,
};
