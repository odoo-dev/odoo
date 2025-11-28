import { registry } from "@web/core/registry";
import { odooExceptionTitleMap, ErrorDialog } from "@web/core/errors/error_dialogs";
import { ConnectionLostError, RPCError } from "@web/core/network/rpc";
import { ReloadErrorPopup } from "@point_of_sale/app/components/popups/reload_error_popup/reload_error_popup";
import { _t } from "@web/core/l10n/translation";

export function handleRPCError(error, dialog) {
    const { data } = error;
    if (odooExceptionTitleMap.has(error.exceptionName)) {
        const title = odooExceptionTitleMap.get(error.exceptionName).toString();
        dialog.add(ReloadErrorPopup, { title, body: data.message });
    } else {
        dialog.add(ReloadErrorPopup, {
            title: _t("Odoo Server Error"),
            body: data.message,
        });
    }
}

function rpcErrorHandler(env, error, originalError) {
    if (originalError instanceof RPCError) {
        handleRPCError(originalError, env.services.dialog);
        return true;
    }
}
registry.category("error_handlers").add("pos-rpcErrorHandler", rpcErrorHandler);

export function offlineErrorHandler(env, error, originalError) {
    if (originalError instanceof ConnectionLostError) {
        if (!env.services.pos.data.network.warningTriggered) {
            env.services.dialog.add(ReloadErrorPopup, {
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
registry.category("error_handlers").add("pos-offlineErrorHandler", offlineErrorHandler);

function defaultErrorHandler(env, error, originalError) {
    if (error instanceof Error) {
        env.services.dialog.add(ErrorDialog, {
            traceback: error.traceback,
        });
    } else {
        env.services.dialog.add(ReloadErrorPopup, {
            title: _t("Unknown Error"),
            body: _t("Unable to show information about this error."),
        });
    }
    return true;
}
registry
    .category("error_handlers")
    .add("pos-defaultErrorHandler", defaultErrorHandler, { sequence: 99 });
