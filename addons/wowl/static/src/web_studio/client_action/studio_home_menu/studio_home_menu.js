/** @odoo-module **/
import { HomeMenu } from "@wowl/web_enterprise/webclient/home_menu/home_menu";
import { IconCreator } from "../icon_creator/icon_creator";
import { Dialog } from "@wowl/components/dialog/dialog";
import { useService } from "@wowl/core/hooks";
import { NotEditableActionError } from "../../studio_service";

const NEW_APP_BUTTON = {
  isNewAppButton: true,
  label: "New App",
  webIconData: "/web_studio/static/src/img/default_icon_app.png",
};

/**
 * Studio home menu
 *
 * Studio version of the standard enterprise home menu. It has roughly the same
 * implementation, with the exception of the app icon edition and the app creator.
 * @extends HomeMenu
 */
export class StudioHomeMenu extends HomeMenu {
  /**
   * @param {Object} props
   * @param {Object[]} props.apps application icons
   * @param {string} props.apps[].action
   * @param {number} props.apps[].id
   * @param {string} props.apps[].label
   * @param {string} props.apps[].parents
   * @param {(boolean|string|Object)} props.apps[].webIcon either:
   *      - boolean: false (no webIcon)
   *      - string: path to Odoo icon file
   *      - Object: customized icon (background, class and color)
   * @param {string} [props.apps[].webIconData]
   * @param {string} props.apps[].xmlid
   */
  constructor() {
    super(...arguments);

    // this.am = useService("action");
    this.user = useService("user");
    this.studio = useService("studio");
    this.notifications = useService("notification");

    this.state.iconCreatorDialogShown = false;
    this.state.editedAppData = {};
  }

  mounted() {
    super.mounted();
    this.canEditIcons = true;
    this.el.classList.add("o_studio_home_menu");
  }

  async willUpdateProps(nextProps) {
    this.availableApps = this.state.query.length ? this._filter(nextProps.apps) : nextProps.apps;
  }

  //--------------------------------------------------------------------------
  // Getters
  //--------------------------------------------------------------------------

  get displayedApps() {
    return super.displayedApps.concat([NEW_APP_BUTTON]);
  }

  //--------------------------------------------------------------------------
  // Private
  //--------------------------------------------------------------------------

  /**
   * @private
   */
  _closeDialog() {
    this.state.iconCreatorDialogShown = false;
    delete this.initialAppData;
  }

  /**
   * @override
   * @private
   */
  async _openMenu(menu) {
    if (menu.isNewAppButton) {
      this.canEditIcons = false;
      return this.studio.open(this.studio.MODES.APP_CREATOR);
    } else {
      try {
        await this.studio.open(this.studio.MODES.EDITOR, menu.actionID);
        this.menus.setCurrentMenu(menu);
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

  //--------------------------------------------------------------------------
  // Handlers
  //--------------------------------------------------------------------------

  /**
   * @private
   */
  async _onSave() {
    const { appId, type } = this.initialAppData;
    let iconValue;
    if (this.state.editedAppData.type !== type) {
      // different type
      if (this.state.editedAppData.type === "base64") {
        iconValue = this.state.editedAppData.uploaded_attachment_id;
      } else {
        const { iconClass, color, backgroundColor } = this.state.editedAppData;
        iconValue = [iconClass, color, backgroundColor];
      }
    } else if (this.state.editedAppData.type === "custom_icon") {
      // custom icon changed
      const { iconClass, color, backgroundColor } = this.state.editedAppData;
      if (
        this.initialAppData.iconClass !== iconClass ||
        this.initialAppData.color !== color ||
        this.initialAppData.backgroundColor !== backgroundColor
      ) {
        iconValue = [iconClass, color, backgroundColor];
      }
    } else if (this.state.editedAppData.uploaded_attachment_id) {
      // new attachment
      iconValue = this.state.editedAppData.uploaded_attachment_id;
    }

    if (iconValue) {
      await this.rpc({
        route: "/web_studio/edit_menu_icon",
        params: {
          context: this.user.context,
          icon: iconValue,
          menu_id: appId,
        },
      });
      await new Promise((resolve) => {
        this.trigger("reload_menu_data", {
          callback: resolve,
        });
      });
    }
    this._closeDialog();
  }

  /**
   * @private
   * @param {Object} app
   */
  _onEditIconClick(app) {
    if (!this.canEditIcons) {
      return;
    }
    if (app.webIconData) {
      this.state.editedAppData = {
        webIconData: app.webIconData,
        type: "base64",
      };
    } else {
      this.state.editedAppData = {
        backgroundColor: app.webIcon.backgroundColor,
        color: app.webIcon.color,
        iconClass: app.webIcon.iconClass,
        type: "custom_icon",
      };
    }
    this.initialAppData = Object.assign(
      {
        appId: app.id,
      },
      this.state.editedAppData
    );
    this.state.iconCreatorDialogShown = true;
  }

  /**
   * @private
   * @param {CustomEvent} ev
   */
  _onIconChanged(ev) {
    for (const key in this.state.editedAppData) {
      delete this.state.editedAppData[key];
    }
    for (const key in ev.detail) {
      this.state.editedAppData[key] = ev.detail[key];
    }
  }

  // AAB: i think it's no longer useful
  // /**
  //  * @private
  //  */
  // _onNewAppClick() {
  //     this.canEditIcons = false;
  // }
}

StudioHomeMenu.components = Object.assign({}, HomeMenu.components, { IconCreator, Dialog });
StudioHomeMenu.props = { apps: HomeMenu.props.apps };
StudioHomeMenu.template = "web_studio.StudioHomeMenu";
