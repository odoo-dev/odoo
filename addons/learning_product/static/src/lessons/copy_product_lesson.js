import { _t } from "@web/core/l10n/translation";
import { formSaved, typed, typedChange } from "@learning/core/step_conditions";
import {
    ACTIONS_MENU,
    ACTIONS_MENU_ITEM,
    fieldInput,
    NAME_FIELD,
    SAVE_BUTTON,
} from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";

const isCopyName = (value) => /\(.*\)\s*$/.test(value || "");

lessonRegistry.add("copy_product", {
    name: _t("Copy a product"),
    intro: _t("Make a similar product in seconds: duplicate it, then change what differs."),
    level: "C",
    sequence: 20,
    teaches: { fields: ["product.template.list_price"] },
    focus: ["name", "list_price"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: ACTIONS_MENU,
                    bubble: _t("Click ⋮"),
                    content: _t(
                        "You also sell this pipe in 22mm. Instead of starting from scratch, copy it: open the ⋮ menu."
                    ),
                    run: "click",
                    until: { trigger: ACTIONS_MENU_ITEM, text: _t("Duplicate") },
                },
                {
                    trigger: ACTIONS_MENU_ITEM,
                    text: _t("Duplicate"),
                    bubble: _t("Click Duplicate"),
                    content: _t("Click Duplicate: the copy has everything already filled in."),
                    run: "click",
                    until: () => isCopyName(document.querySelector(NAME_FIELD)?.value),
                },
                {
                    trigger: NAME_FIELD,
                    bubble: _t("Type “Copper pipe 22mm”"),
                    content: _t("This is the copy. Change its name to “Copper pipe 22mm”."),
                    run: "edit Copper pipe 22mm",
                    until: typedChange((value) => value.length > 0 && !isCopyName(value)),
                },
                {
                    trigger: fieldInput("list_price"),
                    bubble: _t("Type “12”"),
                    content: _t("A bigger pipe costs more: change the price to 12."),
                    run: "edit 12",
                    until: typed((value) => value.startsWith("12")),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud. You now have both pipes, and the first one did not change."),
                    run: "click",
                    until: formSaved(),
                    registerCreated: "product.template",
                },
            ],
        },
    ],
});
