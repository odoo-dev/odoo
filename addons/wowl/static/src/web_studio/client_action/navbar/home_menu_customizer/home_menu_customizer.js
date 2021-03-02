/** @odoo-module */
import { useService } from "@wowl/core/hooks";
import { FileUploader } from "@wowl/components/file_uploader/file_uploader";
import { Dropdown } from "@wowl/components/dropdown/dropdown";
import { DropdownItem } from "@wowl/components/dropdown/dropdown_item";
import { SimpleConfirmationDialog } from "./simple_confirmation_dialog";

export class HomeMenuCustomizer extends owl.Component {
  constructor() {
    super(...arguments);
    this.fileUploader = owl.hooks.useRef("fileUploader");
    this.rpc = useService("rpc");
    this.ui = useService("ui");
    this.notification = useService("notification");
    this.user = useService("user");
    this.download = useService("download");
    this.actionManager = useService("action");
    this.menus = useService("menu");
    this.dialogManager = useService("dialog");
    this.bgImageUploaded = this.bgImageUploaded.bind(this); // is executed as a callback
  }

  _changeBackgroundImage() {
    this.fileUploader.comp.chooseFiles();
  }

  async bgImageUploaded(payload) {
    if (payload.error || !payload.id) {
      this.notification.create(payload); // FIXME
    } else {
      this.ui.block();
      try {
        await this._setBackgroundImage(payload.id);
        odoo.browser.location.reload();
      } finally {
        this.ui.unblock();
      }
    }
  }

  _setBackgroundImage(attachment_id) {
    return this.rpc("/web_studio/set_background_image", {
      attachment_id: attachment_id,
      context: this.user.context,
    });
  }
  /**
   * Export all customizations done by Studio in a zip file containing Odoo
   * modules.
   */
  _export() {
    this.download({ url: "/web_studio/export", data: {} });
  }
  /**
   * Open a dialog allowing to import new modules
   * (e.g. exported customizations).
   */
  _import() {
    const action = {
      name: "Import modules",
      res_model: "base.import.module",
      views: [[false, "form"]],
      type: "ir.actions.act_window",
      target: "new",
      context: {
        dialog_size: "medium",
      },
    };
    const options = {
      onClose: () => this.menus.reload(),
    };
    this.actionManager.doAction(action, options);
  }

  async _resetBgConfirmed() {
    this.ui.block();
    try {
      await this.rpc("/web_studio/reset_background_image", {
        context: this.user.context,
      });
      odoo.browser.location.reload();
    } finally {
      this.ui.unblock();
    }
  }

  _resetBgImage() {
    this.dialogManager.open(SimpleConfirmationDialog, {
      body: this.env._t("Are you sure you want to reset the background image?"),
      title: this.env._t("Confirmation"),
      confirm: () => this._resetBgConfirmed(),
    });
  }
}
HomeMenuCustomizer.template = "wowl.studio.HomeMenuCustomizer";
HomeMenuCustomizer.components = { Dropdown, DropdownItem, FileUploader };
