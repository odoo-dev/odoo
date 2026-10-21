import { _t } from "@web/core/l10n/translation";
import { formSaved, typed } from "@learning/core/step_conditions";
import { fieldInput, NAME_FIELD, NEW_BUTTON, SAVE_BUTTON } from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";
import { menuSteps } from "@learning/lessons/menu_steps";

lessonRegistry.add("first_product", {
    name: _t("Your first product"),
    intro: _t("Add something you sell, with its price, so you can put it on your quotes."),
    level: "C",
    sequence: 10,
    teaches: {
        types: ["monetary"],
        fields: ["product.template.name", "product.template.list_price"],
    },
    focus: ["name", "list_price"],
    checkpoints: [
        {
            key: "start",
            steps: ({ menuPath }) => [
                ...menuSteps(menuPath, _t("your products")),
                {
                    trigger: NEW_BUTTON,
                    bubble: _t("Click New"),
                    content: _t("Everything you sell is a product: materials, but also your work. Click New."),
                    run: "click",
                    until: NAME_FIELD,
                },
                {
                    trigger: NAME_FIELD,
                    bubble: _t("Type “Copper elbow 15mm”"),
                    content: _t("Type the name your customers will read on quotes, for example “Copper elbow 15mm”."),
                    run: "edit Copper elbow 15mm",
                    until: typed(),
                },
                {
                    trigger: fieldInput("list_price"),
                    bubble: _t("Type “4.50”"),
                    content: _t("Type the sales price, the price before tax, for example 4.50."),
                    run: "edit 4.50",
                    until: typed(),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to save your product. Many other fields: you can ignore them for now."),
                    run: "click",
                    until: formSaved(),
                    registerCreated: "product.template",
                },
            ],
        },
    ],
});
