/** @odoo-module **/
import { systrayRegistry } from "@wowl/webclient/systray_registry";
import { useService } from "@wowl/core/hooks";

export class StudioSystray extends owl.Component {
  constructor() {
    super(...arguments);
    this.actionManager = useService("action");
    this.hm = useService("home_menu");
    this.studio = useService("studio");
    this.env.bus.on("ACTION_MANAGER:UI-UPDATED", this, (mode) => {
      if (mode !== "new") {
        this.render();
      }
    });
  }
  /**
    should react to actionamanger and home menu, store the action descriptor
    determine if the action is editable
   **/
  get buttonDisabled() {
    return !this.studio.isStudioEditable();
  }
  _onClick() {
    this.studio.open();
  }
}
StudioSystray.template = "web_studio.SystrayItem";

systrayRegistry.add("StudioSystrayItem", StudioSystray, { sequence: 1 });
