/** @odoo-module **/
import { EnterpriseNavBar } from "@wowl/web_enterprise/webclient/navbar/navbar";
import { NotEditableActionError } from "../../studio_service";
import { useService } from "@wowl/core/hooks";
import { HomeMenuCustomizer } from "./home_menu_customizer/home_menu_customizer";
import { EditMenuItem } from '../../legacy/edit_menu/edit_menu_adapter';

export class StudioNavbar extends EnterpriseNavBar {
  constructor() {
    super(...arguments);
    this.studio = useService("studio");
    this.actionManager = useService("action");
    this.user = useService("user");
    this.dialogManager = useService('dialog');
    owl.hooks.onMounted(() => {
      this.env.bus.off("HOME-MENU:TOGGLED", this);
      this._updateMenuAppsIcon();
    });
  }
  onMenuToggle() {
    this.studio.toggleHomeMenu();
  }
  closeStudio() {
    this.studio.leave();
  }
  async onNavBarDropdownItemSelection(ev) {
    if (ev.detail.payload.actionID) {
      try {
        await this.studio.open(this.studio.MODES.EDITOR, ev.detail.payload.actionID);
      } catch (e) {
        if (e instanceof NotEditableActionError) {
          const options = { type: "danger" };
          this.notifications.create(this.env._t("This action is not editable by Studio"), options);
          return;
        }
        throw e;
      }
    }
  }
  get hasBackgroundAction() {
    return this.studio.editedAction || (this.studio.MODES.APP_CREATOR === this.studio.mode);
  }
  get isInApp() {
    return this.studio.mode === this.studio.MODES.EDITOR;
  }
  _onNotesClicked() {
    // LPE fixme: dbuuid should be injected into session_info python side
    const action = {
      type: "ir.actions.act_url",
      url: `http://pad.odoo.com/p/customization-${this.user.db.uuid}`,
    };
    // LPE Fixme: this could be either the local AM or the GlobalAM
    // we don(t care i-here as we open an url anyway)
    this.actionManager.doAction(action);
  }
}
StudioNavbar.template = "wowl.StudioNavbar";
StudioNavbar.components.HomeMenuCustomizer = HomeMenuCustomizer;
StudioNavbar.components.EditMenuItem = EditMenuItem;
