import { Component } from "@odoo/owl";
import { Stringifiable, _lt } from "../../core/localization";
import { OdooEnv } from "../../types";
import { Dialog } from "../../components/dialog/dialog";

export function documentationItem(env: OdooEnv) {
  const documentationURL = "https://www.odoo.com/documentation/user";
  return {
    description: env._t("Documentation"),
    href: documentationURL,
    callback: () => {
      odoo.browser.open(documentationURL, "_blank");
    },
    sequence: 10,
  };
}

export function supportItem(env: OdooEnv) {
  const buyEnterpriseURL = "https://www.odoo.com/buy";
  return {
    description: env._t("Support"),
    href: buyEnterpriseURL,
    callback: () => {
      odoo.browser.open(buyEnterpriseURL, "_blank");
    },
    sequence: 20,
  };
}

class ShortCutsDialog extends Component {
  static template = "wowl.UserMenu.ShortCutsDialog";
  static components = { Dialog };
  title: Stringifiable = _lt("Keyboard Shortcuts");
}

export function shortCutsItem(env: OdooEnv) {
  return {
    description: env._t("Shortcuts"),
    callback: () => {
      env.services.dialog_manager.open(ShortCutsDialog);
    },
    sequence: 30,
  };
}

export function preferencesItem(env: OdooEnv) {
  return {
    description: env._t("Preferences"),
    callback: async function () {
      const actionDescription = await env.services.model("res.users").call("action_get");
      actionDescription.res_id = env.services.user.userId;
      env.services.action_manager.doAction(actionDescription);
    },
    sequence: 50,
  };
}

export function odooAccountItem(env: OdooEnv) {
  return {
    description: env._t("My Odoo.com.account"),
    callback: () => {
      env.services
        .rpc("/web/session/account")
        .then((url) => {
          odoo.browser.location.href = url;
        })
        .catch(() => {
          odoo.browser.location.href = "https://accounts.odoo.com/account";
        });
    },
    sequence: 60,
  };
}

export function logOutItem(env: OdooEnv) {
  const route = "/web/session/logout";
  return {
    description: env._t("Log out"),
    href: `${odoo.browser.location.origin}${route}`,
    callback: () => {
      odoo.browser.location.href = route;
    },
    sequence: 70,
  };
}
