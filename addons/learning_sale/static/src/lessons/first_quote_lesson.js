import { _t } from "@web/core/l10n/translation";
import { formSaved, typed } from "@learning/core/step_conditions";
import { NEW_BUTTON, SAVE_BUTTON } from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";
import { menuSteps } from "@learning/lessons/menu_steps";
import {
    ADD_TO_LINES,
    CUSTOMER_INPUT,
    CUSTOMER_OPTION,
    EDITED_LABEL,
    EDITED_QUANTITY,
    LINE_OPTION,
    newLineStarted,
    picked,
} from "./quote_selectors";

/** Steps adding one line: pick the product, then set the quantity. */
function lineSteps({ search, product, quantity, lineNumber, explain }) {
    return [
        {
            trigger: ADD_TO_LINES,
            text: _t("Add Line"),
            bubble: _t("Add Line"),
            content:
                lineNumber === 1
                    ? _t("A quote is a list of lines. Click “Add Line” to start the first one.")
                    : _t("Click “Add Line” again for the next line."),
            run: "click",
            until: newLineStarted(lineNumber - 1),
        },
        {
            trigger: EDITED_LABEL,
            bubble: _t("Type “%s”", search),
            content: _t("Type “%s”: Odoo suggests your products.", search),
            run: `edit ${search}`,
            until: { trigger: LINE_OPTION, text: product },
        },
        {
            trigger: LINE_OPTION,
            text: product,
            bubble: _t("Pick “%s”", product),
            content: _t("Pick “%s”.", product),
            run: "click",
            until: picked(EDITED_LABEL, LINE_OPTION, product),
        },
        {
            trigger: EDITED_QUANTITY,
            bubble: _t("Type “%s”", quantity),
            content: explain,
            run: `edit ${quantity}`,
            until: typed((value) => value.startsWith(quantity)),
        },
    ];
}

lessonRegistry.add("first_quote", {
    name: _t("Your first quote"),
    intro: _t("Make a quote for a customer, with your materials and your hours of work."),
    level: "D",
    sequence: 10,
    teaches: { fields: ["sale.order.partner_id", "sale.order.order_line"] },
    focus: ["partner_id", "order_line"],
    checkpoints: [
        {
            key: "start",
            steps: ({ menuPath }) => [
                ...menuSteps(menuPath, _t("your quotations")),
                {
                    trigger: NEW_BUTTON,
                    bubble: _t("Click New"),
                    content: _t("Click New to start a quote."),
                    run: "click",
                    until: CUSTOMER_INPUT,
                },
                {
                    trigger: CUSTOMER_INPUT,
                    bubble: _t("Type “Dupont”"),
                    content: _t("Who is it for? Type “Dupont” in Customer."),
                    run: "edit Dupont",
                    until: { trigger: CUSTOMER_OPTION, text: "Jean Dupont" },
                },
                {
                    trigger: CUSTOMER_OPTION,
                    text: "Jean Dupont",
                    bubble: _t("Pick “Jean Dupont”"),
                    content: _t("Pick “Jean Dupont”. A customer who is not there yet could be created right here."),
                    run: "click",
                    until: picked(CUSTOMER_INPUT, CUSTOMER_OPTION, "Jean Dupont"),
                },
                ...lineSteps({
                    search: "Copper",
                    product: "Copper pipe 15mm",
                    quantity: "3",
                    lineNumber: 1,
                    explain: _t(
                        "Odoo filled in the price from the product: you can still change it on the line. Set the quantity to 3."
                    ),
                }),
                ...lineSteps({
                    search: "Labour",
                    product: "Labour (per hour)",
                    quantity: "2",
                    lineNumber: 2,
                    explain: _t("Labour is sold by the hour: type 2 for two hours of work."),
                }),
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("The total is computed for you. Click the cloud to save the quote."),
                    run: "click",
                    until: formSaved(),
                    registerCreated: "sale.order",
                },
            ],
        },
    ],
});
