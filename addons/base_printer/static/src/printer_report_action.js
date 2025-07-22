import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

export async function printEmailReport(env, args) {
    const orm = env.services.orm;
    const notification = env.services.notification;

    const [reportId, activeRecordIds, reportData, selectedDeviceIds] = args;
    const printers = await orm.call("ir.actions.report", "render_and_send_email", [
        reportId,
        activeRecordIds,
        reportData,
        selectedDeviceIds,
    ]);

    notification.add(
        _t(`Report sent for printing to printer: ${printers.map((p) => p.name).join(", ")}`),
        {
            type: "info",
        }
    );
}

async function printerReportActionHandler(action, options, env) {
    if (action.linked_printer_ids.length) {
        const singlePrinter = action.linked_printer_ids.length === 1;

        if (singlePrinter) {
            const args = [
                action.id,
                action.context.active_ids,
                action.data,
                [action.linked_printer_ids[0].id],
            ];
            await printEmailReport(env, args);
        } else {
            env.services.action.doAction({
                type: "ir.actions.act_window",
                name: _t("Printers"),
                res_model: "select.report.printers.wizard",
                view_mode: "form",
                views: [[false, "form"]],
                target: "new",
                context: {
                    report_id: action.id,
                    active_ids: action.context.active_ids,
                    data: action.data,
                },
            });
        }

        return { reportHandler: true, close_on_report_handler: true };
    }
}

registry
    .category("ir.actions.report handlers")
    .add("printer_report_action_handler", printerReportActionHandler);
