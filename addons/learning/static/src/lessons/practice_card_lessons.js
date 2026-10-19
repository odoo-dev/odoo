import { _t } from "@web/core/l10n/translation";
import { formSaved, typed, typedChange } from "../core/step_conditions";
import { lessonRegistry } from "./lesson_registry";

const NAME_INPUT = ".o_form_view .o_field_widget[name=name] input";
const SAVE_BUTTON = ".o_form_view .o_form_button_save";
const DISCARD_BUTTON = ".o_form_view .o_form_button_cancel";
const BACK_TO_LIST = ".o_breadcrumb li.o_back_button a";
// rows open on a click in one of their cells
const LIST_ROW = ".o_list_view .o_data_row .o_data_cell";

/** Copies of practice cards are named "<name> (copy)" (see `copy_data`). */
const isCopyName = (value) => Boolean(value?.trim().endsWith(")") && value.includes("("));

lessonRegistry.add("first_card", {
    name: _t("Create your first card"),
    intro: _t("Create something new in Odoo, give it a name and see that it is kept."),
    level: "A",
    sequence: 10,
    teaches: { types: ["char"], fields: ["learning.practice.card.name"] },
    focus: ["name"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: ".o_list_button_add",
                    bubble: _t("Click New"),
                    content: _t("This is your list of practice cards. Click New to create one."),
                    run: "click",
                    until: NAME_INPUT,
                },
                {
                    trigger: NAME_INPUT,
                    bubble: _t("Type a name"),
                    content: _t("Type a name for your card, for example “Buy copper pipes”."),
                    run: "edit Buy copper pipes",
                    until: typed(),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to save your card."),
                    run: "click",
                    until: formSaved(),
                },
                {
                    trigger: NAME_INPUT,
                    bubble: _t("Change the name"),
                    content: _t(
                        "Change the name again, for example “Buy copper pipes and fittings”. See the cloud coming back? It means: changes not saved yet."
                    ),
                    run: "edit Buy copper pipes and fittings",
                    until: typedChange(),
                },
                {
                    trigger: BACK_TO_LIST,
                    bubble: _t("Back to the list"),
                    content: _t(
                        "This time, don't click the cloud: just go back to the list with “Practice Cards” at the top. When you leave, Odoo saves for you."
                    ),
                    run: "click",
                    until: LIST_ROW,
                },
                {
                    trigger: LIST_ROW,
                    bubble: _t("Open your card"),
                    content: _t(
                        "The list shows the new name: it was saved when you left. Open your card to see for yourself."
                    ),
                    run: "click",
                    until: NAME_INPUT,
                },
            ],
        },
    ],
});

lessonRegistry.add("discard_card", {
    name: _t("Change your mind"),
    intro: _t("Throw away a change you did not want, before Odoo keeps it."),
    level: "A",
    sequence: 15,
    focus: ["name"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: NAME_INPUT,
                    bubble: _t("Change the name"),
                    content: _t(
                        "Imagine you changed this card by mistake: replace its name with anything, for example “Oops, wrong name”."
                    ),
                    run: "edit Oops, wrong name",
                    until: typedChange(),
                },
                {
                    trigger: DISCARD_BUTTON,
                    bubble: _t("Click ✕"),
                    content: _t(
                        "Leaving now would keep this mistake. To throw your change away, click ✕ next to the cloud."
                    ),
                    run: "click",
                    until: formSaved(),
                },
                {
                    trigger: BACK_TO_LIST,
                    bubble: _t("Back to the list"),
                    content: _t(
                        "The old name is back, nothing was kept. Now you can leave safely: go back to the list. Good to know: if a field is red, Odoo cannot save when you leave and asks you what to do."
                    ),
                    run: "click",
                    until: LIST_ROW,
                },
            ],
        },
    ],
});

lessonRegistry.add("copy_card", {
    name: _t("Make a copy"),
    intro: _t("Make a new card from an existing one, then change what is different."),
    level: "A",
    sequence: 20,
    focus: ["name"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    // the "⋮" actions menu of the form (its hotkey is stable across versions)
                    trigger: ".o_cp_action_menus button[data-hotkey=u]",
                    bubble: _t("Click ⋮"),
                    content: _t(
                        "Extra things you can do with this card are behind the button with three dots ⋮, next to its name."
                    ),
                    run: "click",
                    until: { trigger: ".o-dropdown-item", text: _t("Duplicate") },
                },
                {
                    trigger: ".o-dropdown-item",
                    text: _t("Duplicate"),
                    bubble: _t("Click Duplicate"),
                    content: _t("Duplicate makes a copy of this card, with everything already filled in."),
                    run: "click",
                    until: () => isCopyName(document.querySelector(NAME_INPUT)?.value),
                },
                {
                    trigger: NAME_INPUT,
                    bubble: _t("Change the name"),
                    content: _t("This is your copy: a new card. Give it its own name, for example “Buy brass fittings”."),
                    run: "edit Buy brass fittings",
                    until: typed((value) => value.length > 0 && !isCopyName(value)),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to keep your copy. The original card did not change."),
                    run: "click",
                    until: formSaved(),
                },
            ],
        },
    ],
});
