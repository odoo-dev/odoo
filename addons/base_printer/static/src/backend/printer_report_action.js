import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { PrintLabel } from "@base_printer/backend/label/label";

const EPSON_FORMAT_SIZE = {
    "product.report_producttemplatelabel_dymo": "dymo",
    "product.report_producttemplatelabel2x7": "2x7",
    "product.report_producttemplatelabel4x7": "4x7",
    "product.report_producttemplatelabel4x12": "4x12",
    "product.report_producttemplatelabel4x12noprice": "4x12_no_price",
};

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
            if (printer.printer_mode == "ip" && printer.printer_ip) {
                const productIds = Object.keys(action.data.quantity_by_product)
                .map((productId) => parseInt(productId))
                const product_data = await orm.call("ir.actions.report", "get_product_data", [
                    "",
                    action.data.active_model,
                    productIds,
                    action.pricelist_id,
                ]);
                for (const product of product_data['products']) {
                    let cnt = 0;
                    const quantity = action.data.quantity_by_product?.[product.id] || 1;
                    while (cnt < quantity) {
                        await env.services.label_printer.print(PrintLabel, {
                            product: product,
                            label_template: EPSON_FORMAT_SIZE[action.report_name],
                        }, {}, printer.printer_ip);           
                        cnt++;
                    }
                }
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
