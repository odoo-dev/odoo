import { _t } from "@web/core/l10n/translation";
import { findTarget } from "@learning/core/dom_target";
import { formSaved, typed } from "@learning/core/step_conditions";
import {
    AUTOCOMPLETE_OPTION,
    fieldInput,
    NAME_FIELD,
    NEW_BUTTON,
    SAVE_BUTTON,
} from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";

const SERVICE_RADIO = ".o_form_view .o_field_widget[name=type] input[data-value=service]";
const UNIT = ".o_form_view .o_field_widget[name=uom_id]";

lessonRegistry.add("labour_service", {
    name: _t("Sell your work by the hour"),
    intro: _t("Create your labour as a service sold per hour, ready to be added to quotes."),
    level: "C",
    sequence: 40,
    teaches: {
        types: ["selection"],
        fields: ["product.template.type", "product.template.uom_id"],
    },
    focus: ["name", "type", "list_price", "uom_id"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: NEW_BUTTON,
                    bubble: _t("Click New"),
                    content: _t("Your time is something you sell too. Create a product for it: click New."),
                    run: "click",
                    until: NAME_FIELD,
                },
                {
                    trigger: NAME_FIELD,
                    bubble: _t("Type “Labour (per hour)”"),
                    content: _t("Type “Labour (per hour)”."),
                    run: "edit Labour (per hour)",
                    until: typed(),
                },
                {
                    trigger: SERVICE_RADIO,
                    bubble: _t("Choose Service"),
                    content: _t("Labour is not goods you keep in stock: choose Service."),
                    run: "click",
                    until: () => findTarget({ trigger: SERVICE_RADIO })?.checked,
                },
                {
                    trigger: fieldInput("list_price"),
                    bubble: _t("Type “45”"),
                    content: _t("Type your hourly rate, for example 45."),
                    run: "edit 45",
                    until: typed(),
                },
                {
                    trigger: `${UNIT} input`,
                    bubble: _t("Type “Hours”"),
                    content: _t("Next to the price, the unit says what one is: type “Hours”."),
                    run: "edit Hours",
                    // skipped when the unit already is hours
                    until: { trigger: `${UNIT} ${AUTOCOMPLETE_OPTION}`, text: _t("Hours") },
                },
                {
                    trigger: `${UNIT} ${AUTOCOMPLETE_OPTION}`,
                    text: _t("Hours"),
                    bubble: _t("Pick Hours"),
                    content: _t("Pick “Hours”: on quotes, 2 of this product will mean 2 hours."),
                    run: "click",
                    until: () =>
                        !findTarget({ trigger: `${UNIT} ${AUTOCOMPLETE_OPTION}` }) &&
                        (document.querySelector(`${UNIT} input`)?.value || "").includes(_t("Hours")),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to save your labour product."),
                    run: "click",
                    until: formSaved(),
                    registerCreated: "product.template",
                },
            ],
        },
    ],
});
