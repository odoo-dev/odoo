import { _t } from "@web/core/l10n/translation";
import { findTarget } from "../core/dom_target";
import { formSaved, typed } from "../core/step_conditions";
import { lessonRegistry } from "./lesson_registry";
import { SAVE_BUTTON } from "./common_selectors";

const LINES = ".o_field_widget[name=line_ids]";
const ADD_LINE = `${LINES} .o_field_x2many_list_row_add button`;
const EDITED_NAME = `${LINES} .o_selected_row .o_field_widget[name=name] input`;
const EDITED_QUANTITY = `${LINES} .o_selected_row .o_field_widget[name=quantity] input`;

const lineCount = () => document.querySelectorAll(`${LINES} .o_data_row`).length;

lessonRegistry.add("card_lines", {
    name: _t("Lists inside a card"),
    intro: _t("Add, fill in and remove lines of a list inside a card: quotes work the same way."),
    level: "A",
    sequence: 40,
    teaches: {
        types: ["integer", "one2many"],
        fields: ["learning.practice.card.line_ids"],
    },
    focus: ["name", "line_ids"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: ADD_LINE,
                    bubble: _t("Add a line"),
                    content: _t(
                        "This card has a to-do list: a list inside the card. Click “Add a line” to start the first line."
                    ),
                    run: "click",
                    until: EDITED_NAME,
                },
                {
                    trigger: EDITED_NAME,
                    bubble: _t("Type “Remove old tiles”"),
                    content: _t("Type what to do, for example “Remove old tiles”."),
                    run: "edit Remove old tiles",
                    until: typed(),
                },
                {
                    trigger: EDITED_QUANTITY,
                    bubble: _t("Type 2"),
                    content: _t(
                        "Each line has its own boxes. Click in Quantity (or press Tab to jump there) and type 2."
                    ),
                    run: "edit 2",
                    until: typed((value) => value === "2"),
                },
                {
                    trigger: ADD_LINE,
                    bubble: _t("Add a line"),
                    content: _t("Click “Add a line” again: the first line is kept, and a new one starts."),
                    run: "click",
                    until: () => lineCount() >= 2 && findTarget({ trigger: EDITED_NAME })?.value === "",
                },
                {
                    trigger: EDITED_NAME,
                    bubble: _t("Type “Lay new tiles”"),
                    content: _t("Type the second thing to do, for example “Lay new tiles”."),
                    run: "edit Lay new tiles",
                    until: typed(),
                },
                {
                    trigger: `${LINES} .o_data_row:first-child .o_list_record_remove button`,
                    bubble: _t("Remove it"),
                    content: _t(
                        "Changed your mind about a line? The bin at its end removes it. Remove the first line."
                    ),
                    run: "click",
                    until: () => lineCount() === 1,
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Lines are saved with their card. Click the cloud to keep your list."),
                    run: "click",
                    until: formSaved(),
                },
            ],
        },
    ],
});
