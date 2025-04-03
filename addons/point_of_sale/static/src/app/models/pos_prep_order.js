import { registry } from "@web/core/registry";
import { Base } from "./related_models";
import { isStr } from "@point_of_sale/utils";
import { _t } from "@web/core/l10n/translation";
import { renderToElement } from "@web/core/utils/render";

const { DateTime } = luxon;

export class PosPrepOrder extends Base {
    static pythonModel = "pos.prep.order";
    get productUnit() {
        return this.models["decimal.precision"].find((dp) => dp.name === "Product Unit");
    }
    get orderInfo() {
        const order = this.pos_order_id;
        return {
            pos_reference: order.getName(),
            config_name: order.config_id.name,
            time: DateTime.now().toFormat("HH:mm"),
            tracking_number: order.tracking_number,
            preset_name: order.preset_id?.name || "",
            preset_time: order.presetDateTime,
            employee_name: order.employee_id?.name || order.user_id?.name,
        };
    }
    get prevCustomerNote() {
        // look back in the history of prep order (via the prev_prep_order_id field) until a defined customer note is found
        let prevPrepOrder = this.prev_prep_order_id;
        while (prevPrepOrder && !isStr(prevPrepOrder.customer_note)) {
            prevPrepOrder = prevPrepOrder.prev_prep_order_id;
        }
        return prevPrepOrder?.customer_note;
    }
    get prevInternalNote() {
        // look back in the history of prep order (via the prev_prep_order_id field) until a defined internal note is found
        let prevPrepOrder = this.prev_prep_order_id;
        while (prevPrepOrder && !prevPrepOrder.internal_note) {
            prevPrepOrder = prevPrepOrder.prev_prep_order_id;
        }
        return prevPrepOrder?.internal_note.map(({ text }) => text).join(", ");
    }
    /**
     * Returns the changes that's associated to the given printer. Each item of the return array
     * can be provided as props to the `point_of_sale.OrderChangeReceipt` template.
     *
     * @param {pos.printer} printer
     * @param {boolean} resend
     * @returns {{
     *    type: "order_notes" | "new" | "cancelled" | "line_note_update",
     *    lines: pos.prep.line[],
     *    prepOrder: pos.prep.order,
     *    title?: string,
     * }[]}
     */
    getChangesProps(printer, resend = false) {
        const prepLinesToSend = this.prep_line_ids.filter(
            (pl) => pl.isForPrinter(printer) && (!pl.isSentTo(printer) || resend)
        );

        const result = [];

        // order_notes
        const orderNotes = [];
        if (isStr(this.customer_note)) {
            orderNotes.push(["customerNote", this.customer_note]);
        }
        if (this.internal_note) {
            orderNotes.push([
                "internalNote",
                this.internal_note.map(({ text }) => text).join(", "),
            ]);
        }
        if (orderNotes.length > 0) {
            result.push({
                ...Object.fromEntries(orderNotes),
                type: "order_notes",
                lines: [],
                prepOrder: this,
            });
        }

        // new
        const newItems = prepLinesToSend.filter((pl) => this.productUnit.isPositive(pl.quantity));
        if (newItems.length > 0) {
            result.push({
                type: "new",
                title: _t("NEW"),
                lines: newItems,
                prepOrder: this,
            });
        }

        // cancelled
        const cancelledItems = prepLinesToSend.filter((pl) =>
            this.productUnit.isNegative(pl.quantity)
        );
        if (cancelledItems.length > 0) {
            result.push({
                type: "cancelled",
                title: _t("CANCELLED"),
                lines: cancelledItems,
                prepOrder: this,
            });
        }

        // line_note_update: pos.order.line note change
        const noteUpdateItems = prepLinesToSend.filter((pl) => pl.note);
        if (noteUpdateItems.length > 0) {
            result.push({
                type: "line_note_update",
                title: _t("NOTE UPDATE"),
                lines: noteUpdateItems,
                prepOrder: this,
            });
        }

        return result;
    }
    /**
     * Sends the changes to the given printer for printing. By default, it sends those
     * derived from `prep_line_ids` that are not yet sent to the printer. It marks
     * this order and the corresponding lines as sent by updating their `pos_printer_ids` field.
     *
     * @param {pos.printer} printer
     * @param {boolean} resend
     */
    async sendChanges(printer, resend = false) {
        for (const props of this.getChangesProps(printer, resend)) {
            const receipt = renderToElement("point_of_sale.OrderChangeReceipt", { props });
            const result = await printer.send(receipt);
            if (result) {
                this.update({
                    pos_printer_ids: [["link", printer]],
                });
                for (const line of props.lines) {
                    line.update({
                        pos_printer_ids: [["link", printer]],
                    });
                }
            }
        }
    }
}

registry.category("pos_available_models").add(PosPrepOrder.pythonModel, PosPrepOrder);
