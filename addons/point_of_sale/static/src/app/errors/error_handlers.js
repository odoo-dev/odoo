/** @odoo-module */

import { registry } from "@web/core/registry";
import { odooExceptionTitleMap, ErrorDialog } from "@web/core/errors/error_dialogs";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

function rpcErrorHandler(env, error, originalError) {
<<<<<<< HEAD
    if (originalError instanceof RPCError) {
        const { data } = originalError;
        if (odooExceptionTitleMap.has(originalError.exceptionName)) {
            const title = odooExceptionTitleMap.get(originalError.exceptionName).toString();
            env.services.dialog.add(AlertDialog, { title, body: data.message });
||||||| parent of 412b363af287 (temp)
    if (error instanceof RPCError) {
        const { message, data } = error;
        if (odooExceptionTitleMap.has(error.exceptionName)) {
            const title = odooExceptionTitleMap.get(error.exceptionName).toString();
            env.services.popup.add(ErrorPopup, { title, body: data.message });
=======
    const rpcError = error instanceof RPCError ? error : (originalError instanceof RPCError ? originalError : null);
    if (rpcError) {
        const { message, data } = rpcError;
        if (odooExceptionTitleMap.has(rpcError.exceptionName)) {
            const title = odooExceptionTitleMap.get(rpcError.exceptionName).toString();
            env.services.popup.add(ErrorPopup, { title, body: data.message });
>>>>>>> 412b363af287 (temp)
        } else {
            env.services.dialog.add(ErrorDialog, {
                traceback: data.message + "\n" + data.debug + "\n",
            });
        }
        return true;
    }
}
registry.category("error_handlers").add("rpcErrorHandler", rpcErrorHandler);

function offlineErrorHandler(env, error, originalError) {
    if (originalError instanceof ConnectionLostError) {
        if (!env.services.pos.data.network.warningTriggered) {
            env.services.dialog.add(AlertDialog, {
                title: _t("Connection Lost"),
                body: _t(
                    "Until the connection is reestablished, Odoo Point of Sale will operate with limited functionality."
                ),
                confirmLabel: _t("Continue with limited functionality"),
            });
            env.services.pos.data.network.warningTriggered = true;
        }

        return true;
    }
}
registry.category("error_handlers").add("offlineErrorHandler", offlineErrorHandler);

function defaultErrorHandler(env, error, originalError) {
    if (error instanceof Error) {
        env.services.dialog.add(ErrorDialog, {
            traceback: error.traceback,
        });
    } else {
        env.services.dialog.add(AlertDialog, {
            title: _t("Unknown Error"),
            body: _t("Unable to show information about this error."),
        });
    }
    return true;
}
registry
    .category("error_handlers")
    .add("defaultErrorHandler", defaultErrorHandler, { sequence: 99 });
