import { Component, hooks } from "@odoo/owl";
import { Odoo, OdooEnv } from "../types";
import { Dialog } from "../components/dialog/dialog";
import { ActionRequest } from "../action_manager/action_manager";
import { useService } from "../core/hooks";
import { Stringifiable, _lt } from "../core/localization";
declare const odoo: Odoo;
const { useState } = hooks;

function capitalize(s: string | undefined): string {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

interface ErrorDialogProps {
  error: {
    message?: string;
    data?: {
      debug?: string;
    };
    subType?: string;
    traceback?: string;
    type: "server" | "script";
  };
}

export class ErrorDialog extends Component<ErrorDialogProps, OdooEnv> {
  static template = "wowl.ErrorDialog";
  static components = { Dialog };
  title: string;
  traceback: string;
  state = useState({
    showTraceback: false,
  });

  constructor() {
    super(...arguments);
    const { data, message, subType, traceback, type } = this.props.error;
    if (type === "server") {
      this.title = capitalize(subType) || this.env._t("Odoo Error");
    } else {
      this.title = this.env._t("Odoo Client Error");
    }
    if (data) {
      this.traceback = `${message}\n${data.debug || ""}`;
    } else {
      this.traceback = traceback || "";
    }
  }

  onClickClipboard() {
    odoo.browser.navigator.clipboard.writeText(`${this.traceback}`);
  }
}

const odooExceptionTitleMap = {
  "odoo.exceptions.AccessDenied": _lt("Access Denied"),
  "odoo.exceptions.AccessError": _lt("Access Error"),
  "odoo.exceptions.MissingError": _lt("Missing Record"),
  "odoo.exceptions.UserError": _lt("User Error"),
  "odoo.exceptions.ValidationError": _lt("Validation Error"),
};

interface WarningDialogProps {
  error: {
    name: keyof typeof odooExceptionTitleMap;
    data?: {
      arguments?: [string, ...any[]];
    };
    message: string;
  };
}

export class WarningDialog extends Component<WarningDialogProps, OdooEnv> {
  static template = "wowl.WarningDialog";
  static components = { Dialog };
  title: string;
  message: string;

  constructor() {
    super(...arguments);
    const { data, message, name } = this.props.error;
    this.title = odooExceptionTitleMap[name].toString();
    if (data && data.arguments && data.arguments.length > 0) {
      this.message = data.arguments[0];
    } else {
      this.message = message;
    }
  }
}

interface RedirectWarningDialogProps {
  error: {
    subType?: string;
    data: {
      arguments: [string, ActionRequest, string, Object | undefined, ...any[]];
    };
  };
}

export class RedirectWarningDialog extends Component<RedirectWarningDialogProps, OdooEnv> {
  static template = "wowl.RedirectWarningDialog";
  static components = { Dialog };
  title: string;
  message: string;
  actionId: ActionRequest;
  buttonText: string;
  additionalContext?: Object | undefined;
  actionManager = useService("action_manager");

  constructor() {
    super(...arguments);
    const { data, subType } = this.props.error;
    const [message, actionId, buttonText, additional_context] = data.arguments;
    this.title = capitalize(subType) || this.env._t("Odoo Warning");
    this.message = message;
    this.actionId = actionId;
    this.buttonText = buttonText;
    this.additionalContext = additional_context;
  }

  onClick() {
    this.actionManager.doAction(this.actionId, { additionalContext: this.additionalContext });
  }

  onCancel() {
    this.trigger("dialog-closed");
  }
}

export class Error504Dialog extends Component<{}, OdooEnv> {
  static template = "wowl.Error504Dialog";
  static components = { Dialog };
  title: Stringifiable = _lt("Request timeout");
}

export class SessionExpiredDialog extends Component<{}, OdooEnv> {
  static template = "wowl.SessionExpiredDialog";
  static components = { Dialog };
  title: Stringifiable = _lt("Odoo Session Expired");

  onClick() {
    odoo.browser.location.reload();
  }
}
