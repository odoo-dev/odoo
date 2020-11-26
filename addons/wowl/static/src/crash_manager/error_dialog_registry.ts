import { Component } from "@odoo/owl";
import { Registry } from "../core/registry";
import {
  Error504Dialog,
  RedirectWarningDialog,
  SessionExpiredDialog,
  WarningDialog,
} from "./error_dialogs";
import { Type } from "../types";

// -----------------------------------------------------------------------------
// Custom Dialogs for CrashManagerService
// -----------------------------------------------------------------------------

export const errorDialogRegistry: Registry<Type<Component>> = new Registry();

errorDialogRegistry
  .add("odoo.exceptions.AccessDenied", WarningDialog)
  .add("odoo.exceptions.AccessError", WarningDialog)
  .add("odoo.exceptions.MissingError", WarningDialog)
  .add("odoo.exceptions.UserError", WarningDialog)
  .add("odoo.exceptions.ValidationError", WarningDialog)
  .add("odoo.exceptions.RedirectWarning", RedirectWarningDialog)
  .add("odoo.http.SessionExpiredException", SessionExpiredDialog)
  .add("werkzeug.exceptions.Forbidden", SessionExpiredDialog)
  .add("504", Error504Dialog);
