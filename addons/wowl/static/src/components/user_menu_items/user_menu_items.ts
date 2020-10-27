import { Component } from "@odoo/owl";
import { Stringifiable, _lt } from "../../core/localization";
import { OdooEnv } from "../../types";
import { UserMenuItem } from "../user_menu/user_menu";
import { Dialog } from "../dialog/dialog";

export const documentationItem: UserMenuItem = {
  description: _lt("Documentation"),
  callback: (env: OdooEnv) => {
    env.browser.open("https://www.odoo.com/documentation/user", "_blank");
  },
  sequence: 10,
};

export const supportItem: UserMenuItem = {
  description: _lt("Support"),
  callback: (env: OdooEnv) => {
    env.browser.open("https://www.odoo.com/buy", "_blank");
  },
  sequence: 20,
};

class ShortCutsDialog extends Component {
  static template = "wowl.UserMenu.ShortCutsDialog";
  static components = { Dialog };
  title: Stringifiable = _lt("Keyboard Shortcuts");
}

export const shortCutsItem: UserMenuItem = {
  description: _lt("ShortCuts"),
  callback: (env: OdooEnv) => {
    env.services.dialog_manager.open(ShortCutsDialog);
  },
  sequence: 30,
};

export const preferencesItem: UserMenuItem = {
  description: _lt("Preferences"),
  callback: async function (env: OdooEnv) {
    const actionDescription = await env.services.model("res.users").call("action_get");
    actionDescription.res_id = env.services.user.userId;
    env.services.action_manager.doAction(actionDescription);
  },
  sequence: 50,
};

export const odooAccountItem: UserMenuItem = {
  description: _lt("My Odoo.com.account"),
  callback: (env: OdooEnv) => {
    env.services
      .rpc("/web/session/account")
      .then((url) => {
        env.browser.location.href = url;
      })
      .catch(() => {
        env.browser.location.href = "https://accounts.odoo.com/account";
      });
  },
  sequence: 60,
};

export const logOutItem: UserMenuItem = {
  description: _lt("Log out"),
  callback: (env: OdooEnv) => {
    env.browser.location.href = "/web/session/logout";
  },
  sequence: 70,
};
