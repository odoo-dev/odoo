import { _t } from "@web/core/l10n/translation";
import { findTarget } from "@learning/core/dom_target";
import { typed } from "@learning/core/step_conditions";
import { lessonRegistry } from "@learning/lessons/lesson_registry";

/*
 * Teaches what every Odoo document has (status bar, action buttons, windows
 * that ask first, draft vs confirmed, smart buttons), with a sale and its
 * invoice as examples. How to sell or invoice is for the apps' own tours.
 */

const STATUS_BAR = ".o_form_view .o_statusbar_status";
const statusIs = (value) => `${STATUS_BAR} .o_arrow_button_current[data-value=${value}]`;
const ACTION_BUTTONS = ".o_form_view .o_statusbar_buttons";
const INVOICE_LINES = ".o_form_view .o_field_widget[name=invoice_line_ids]";
const EDITED_QUANTITY = `${INVOICE_LINES} .o_selected_row .o_field_widget[name=quantity] input`;
/** On an invoice, the smart button leading to the order it comes from. */
const ORDERS_SMART_BUTTON = ".o_form_view .oe_button_box button[name=action_view_source_sale_orders]";

/** @param {{labourName?: string}} params */
function documentLifeSteps({ labourName = "Labour (per hour)" }) {
    return [
        {
            trigger: STATUS_BAR,
            acknowledge: true,
            bubble: _t("Where it stands"),
            content: _t(
                "Top right, the arrows show where this document stands in its life. Every document in Odoo has them: quotes, invoices, deliveries, tasks…"
            ),
        },
        {
            trigger: `${ACTION_BUTTONS} button[name=action_confirm]`,
            bubble: _t("Confirm"),
            content: _t(
                "Top left, the buttons move the document forward. Click Confirm, and watch the arrows."
            ),
            run: "click",
            pointOfNoReturn: true,
            until: statusIs("sale"),
        },
        {
            trigger: `${ACTION_BUTTONS} button#create_invoice`,
            bubble: _t("Create Invoice"),
            content: _t(
                "The arrows moved, and the buttons changed: they always depend on where the document stands. Click Create Invoice."
            ),
            run: "click",
            until: ".o_dialog button[name=create_invoices]",
        },
        {
            trigger: ".o_dialog button[name=create_invoices]",
            bubble: _t("Create Draft"),
            content: _t(
                "Some buttons open a window that asks before doing anything: nothing happens until you answer. Click Create Draft."
            ),
            run: "click",
            until: () =>
                !document.querySelector(".o_dialog") &&
                Boolean(findTarget({ trigger: `${ACTION_BUTTONS} button[name=action_post]` })),
            registerCreated: "account.move",
        },
        {
            trigger: `${INVOICE_LINES} .o_data_row`,
            text: labourName,
            child: ".o_data_cell[name=quantity]",
            bubble: _t("Click the quantity of “%s”", labourName),
            content: _t(
                "A new document, still a draft: the arrows say so. A draft can be changed. The job took 3 hours instead of 2: click the quantity of the labour line."
            ),
            run: "click",
            until: EDITED_QUANTITY,
        },
        {
            trigger: EDITED_QUANTITY,
            bubble: _t("Type “3”"),
            content: _t("Type 3. The totals follow."),
            run: "edit 3",
            until: typed((value) => value.startsWith("3")),
        },
        {
            trigger: `${ACTION_BUTTONS} button[name=action_post]`,
            bubble: _t("Confirm"),
            content: _t("Everything is right: move it forward with Confirm."),
            run: "click",
            pointOfNoReturn: true,
            until: statusIs("posted"),
        },
        {
            trigger: INVOICE_LINES,
            acknowledge: true,
            bubble: _t("Locked"),
            content: _t(
                "Confirmed documents are locked: the lines cannot be edited anymore, they protect what was agreed. That is the same everywhere in Odoo; each app has its own way to correct a confirmed document."
            ),
        },
        {
            trigger: ORDERS_SMART_BUTTON,
            bubble: _t("Click Sale Orders"),
            content: _t(
                "Buttons with a number, top right, link to related documents: this invoice comes from 1 sales order. Click it to jump there."
            ),
            run: "click",
            until: statusIs("sale"),
        },
    ];
}

lessonRegistry.add("document_life", {
    name: _t("A document's life"),
    intro: _t(
        "See how any document moves forward: where it stands, the buttons that move it, drafts that can still change, confirmed documents that are locked, and links between documents."
    ),
    level: "D",
    sequence: 30,
    focus: ["invoice_line_ids", "quantity"],
    checkpoints: [{ key: "start", steps: documentLifeSteps }],
});
