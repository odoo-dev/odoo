import { Component, hooks } from "@odoo/owl";
import { Odoo, OdooEnv } from "../types";
import { Dialog } from "../components/dialog/dialog";
import { ActionRequest } from "../action_manager/action_manager";
import { useService } from "../core/hooks";
import { Stringifiable, _lt } from "../services/localization";
declare const odoo: Odoo;
const { useState } = hooks;

function capitalize(s: string | undefined): string {
  return s ? s[0].toUpperCase() + s.slice(1) : "";
}

export const odooExceptionTitleMap: Map<string, Stringifiable> = new Map();
odooExceptionTitleMap.set("odoo.exceptions.AccessDenied", _lt("Access Denied"));
odooExceptionTitleMap.set("odoo.exceptions.AccessError", _lt("Access Error"));
odooExceptionTitleMap.set("odoo.exceptions.MissingError", _lt("Missing Record"));
odooExceptionTitleMap.set("odoo.exceptions.UserError", _lt("User Error"));
odooExceptionTitleMap.set("odoo.exceptions.ValidationError", _lt("Validation Error"));

interface ErrorDialogProps {
  name?: string;
  message?: string;
  traceback?: string;
}

export class ErrorDialog extends Component<ErrorDialogProps, OdooEnv> {
  static template = "wowl.ErrorDialog";
  static components = { Dialog };
  title = this.env._t("Odoo Error");

  state = useState({
    showTraceback: false,
  });

  onClickClipboard() {
    odoo.browser.navigator.clipboard.writeText(
      `${this.props.name}\n${this.props.message}\n${this.props.traceback}`
    );
  }
}

export class ClientErrorDialog extends ErrorDialog {
  title = this.env._t("Odoo Client Error");
}
export class ServerErrorDialog extends ErrorDialog {
  title = this.env._t("Odoo Server Error");
}
export class NetworkErrorDialog extends ErrorDialog {
  title = this.env._t("Odoo Network Error");
}

interface RPCErrorDialogProps {
  name: string;
  message?: string;
  data?: {
    [key: string]: any;
  };
  subType?: string;
  traceback?: string;
  type?: "server" | "script" | "network";
  exceptionName?: string;
}

export class RPCErrorDialog extends Component<RPCErrorDialogProps, OdooEnv> {
  static template = "wowl.ErrorDialog";
  static components = { Dialog };
  title = this.env._t("Odoo Error");
  traceback?: string;

  state = useState({
    showTraceback: false,
  });

  inferTitle() {
    // If the server provides an exception name that we have in a registry.
    if (this.props.exceptionName && odooExceptionTitleMap.has(this.props.exceptionName)) {
      this.title = odooExceptionTitleMap.get(this.props.exceptionName)!.toString();
      return;
    }
    // Fall back to a name based on the error type.
    if (!this.props.type) return;
    switch (this.props.type) {
      case "server":
        this.title = this.env._t("Odoo Server Error");
        break;
      case "script":
        this.title = this.env._t("Odoo Client Error");
        break;
      case "network":
        this.title = this.env._t("Odoo Network Error");
        break;
    }
  }

  constructor() {
    super(...arguments);
    this.inferTitle();
    this.traceback = this.props.traceback;
    if (this.props.data && this.props.data.debug) {
      this.traceback = `${this.props.data.debug}`;
    }
  }

  onClickClipboard() {
    odoo.browser.navigator.clipboard.writeText(
      `${this.props.name}\n${this.props.message}\n${this.traceback}`
    );
  }
}

interface WarningDialogProps {
  exceptionName?: string;
  data?: {
    arguments?: [string, ...any[]];
  };
  message: string;
}

export class WarningDialog extends Component<WarningDialogProps, OdooEnv> {
  static template = "wowl.WarningDialog";
  static components = { Dialog };
  title: string = this.env._t("Odoo Warning");
  message: string;

  inferTitle() {
    if (this.props.exceptionName && odooExceptionTitleMap.has(this.props.exceptionName)) {
      this.title = odooExceptionTitleMap.get(this.props.exceptionName)!.toString();
    }
  }

  constructor() {
    super(...arguments);
    this.inferTitle();
    const { data, message } = this.props;
    if (data && data.arguments && data.arguments.length > 0) {
      this.message = data.arguments[0];
    } else {
      this.message = message;
    }
  }
}

interface RedirectWarningDialogProps {
  subType?: string;
  data: {
    arguments: [string, ActionRequest, string, Object | undefined, ...any[]];
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
    const { data, subType } = this.props;
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
  title = this.env._t("Request timeout");
}

export class SessionExpiredDialog extends Component<{}, OdooEnv> {
  static template = "wowl.SessionExpiredDialog";
  static components = { Dialog };
  title = this.env._t("Odoo Session Expired");

  onClick() {
    odoo.browser.location.reload();
  }
}
