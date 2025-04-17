import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

async function printerReportActionHandler(action, options, env) {
    if (action.is_printer_linked) {
        const orm = env.services.orm;
        const printer_list = await orm.call("ir.actions.report", "get_linked_printers", [
            action.id,
        ]);
        printer_list.forEach(async (printer) => {
            if (printer.printer_mode == "email") {
                await orm.call("ir.actions.report", "render_and_send_email", [
                    action.id,
                    action.context.active_ids,
                    action.data,
                ]);
                env.services.notification.add(_t("Email is sent to printer with attachment.."), {
                    type: "info",
                });
            }
        });

        env.services.action.doAction(
            { type: "ir.actions.act_window_close" },
            { onClose: options.onClose }
        );
        return true;
    }
}

registry
    .category("ir.actions.report handlers")
    .add("printer_report_action_handler", printerReportActionHandler);
