import { _t } from "@web/core/l10n/translation";
import {
    fieldInput,
    NAME_FIELD,
    NEW_BUTTON,
    SAVE_BUTTON,
} from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";
import { menuSteps } from "@learning/lessons/menu_steps";
import { formSaved, typed } from "@learning/core/step_conditions";

lessonRegistry.add("first_customer", {
    name: _t("Your first customer"),
    intro: _t("Find your contacts through the menus and add a customer with their email and phone."),
    level: "B",
    sequence: 10,
    teaches: {
        types: ["char"],
        fields: ["res.partner.name", "res.partner.email", "res.partner.phone"],
    },
    focus: ["name", "email", "phone"],
    checkpoints: [
        {
            key: "start",
            steps: ({ menuPath }) => [
                ...menuSteps(menuPath, _t("your contacts")),
                {
                    trigger: NEW_BUTTON,
                    bubble: _t("Click New"),
                    content: _t("Customers, suppliers, colleagues: they are all contacts. Click New to add one."),
                    run: "click",
                    until: NAME_FIELD,
                },
                {
                    trigger: NAME_FIELD,
                    bubble: _t("Type “Marie Lambert”"),
                    content: _t(
                        "Type your customer's name, for example “Marie Lambert”. Odoo may suggest companies while you type: you can ignore them."
                    ),
                    run: "edit Marie Lambert",
                    until: typed(),
                    closeSuggestions: true,
                },
                {
                    trigger: fieldInput("email"),
                    bubble: _t("Type “marie.lambert@example.com”"),
                    content: _t(
                        "Type an email. For practice, use one ending with @example.com: such addresses never receive anything."
                    ),
                    run: "edit marie.lambert@example.com",
                    until: typed((value) => value.includes("@")),
                },
                {
                    trigger: fieldInput("phone"),
                    bubble: _t("Type “0470 12 34 56”"),
                    content: _t("Type a phone number, for example 0470 12 34 56."),
                    run: "edit 0470 12 34 56",
                    until: typed(),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to save your customer."),
                    run: "click",
                    until: formSaved(),
                    registerCreated: "res.partner",
                },
            ],
        },
    ],
});
