/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { FormController } from "@web/views/form/form_controller";
import { AlertDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(FormController.prototype, {
    async duplicateRecord() {
        await super.duplicateRecord(...arguments);

        if (this.props.resModel !== "sale.order") {
            return;
        }

        const orderId = this.model.root.resId;
        if (!orderId) {
            return;
        }

        const [order] = await this.orm.read("sale.order", [orderId], ["partner_id"]);
        const partnerId = order?.partner_id?.[0];
        if (partnerId) {
            const [partner] = await this.orm.read(
                "res.partner",
                [partnerId],
                ["name", "sale_warn", "sale_warn_msg"]
            );

            if (partner?.sale_warn && !["no-message", "block"].includes(partner.sale_warn)) {
                this.dialogService.add(AlertDialog, {
                    title: _t("Warning for %s", partner.name),
                    body: partner.sale_warn_msg || "",
                });
            }
        }

        const lines = await this.orm.searchRead(
            "sale.order.line",
            [
                ["order_id", "=", orderId],
                ["product_id", "!=", false],
                ["display_type", "=", false],
            ],
            ["product_id"]
        );

        const productIds = [...new Set(lines.map((l) => l.product_id?.[0]))];

        if (!productIds.length) {
            return;
        }

        const products = await this.orm.read("product.product", productIds, [
            "name",
            "sale_line_warn",
            "sale_line_warn_msg",
        ]);

        for (const p of products) {
            if (p.sale_line_warn && !["no-message", "block"].includes(p.sale_line_warn)) {
                this.dialogService.add(AlertDialog, {
                    title: _t("Warning for %s", p.name),
                    body: p.sale_line_warn_msg || "",
                });
            }
        }
    },
});
