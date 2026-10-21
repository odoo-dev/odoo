import { _t } from "@web/core/l10n/translation";
import { findTarget } from "@learning/core/dom_target";
import { formSaved } from "@learning/core/step_conditions";
import { fieldInput, SAVE_BUTTON } from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";

const COMPANY = ".o_form_view .o_field_widget[name=parent_id]";
const COMPANY_INPUT = fieldInput("parent_id");
const SEARCH_MORE = `${COMPANY} .o_m2o_dropdown_option_search_more`;
const DIALOG = ".o_select_create_dialog_content";
const DIALOG_ROW = `${DIALOG} .o_data_row .o_data_cell`;

lessonRegistry.add("search_more", {
    name: _t("Find in a long list"),
    intro: _t("When a dropdown cannot show everything, open the whole list and search it."),
    level: "B",
    sequence: 30,
    teaches: { fields: ["res.partner.parent_id"] },
    focus: ["name", "parent_id"],
    checkpoints: [
        {
            key: "start",
            steps: [
                {
                    trigger: COMPANY_INPUT,
                    bubble: _t("Type “ing”"),
                    content: _t(
                        "Jean now works for a roofing company in Ghent, among many companies. Type “ing” in Company: far too many match to show them all."
                    ),
                    run: "edit ing",
                    until: SEARCH_MORE,
                },
                {
                    trigger: SEARCH_MORE,
                    bubble: _t("Search more"),
                    content: _t("Click “Search more...”: a window shows the whole list, with its own search bar."),
                    run: "click",
                    until: `${DIALOG} .o_searchview_input`,
                },
                {
                    trigger: `${DIALOG} .o_searchview_input`,
                    bubble: _t("Search “Ghent”"),
                    content: _t("Search it like any list: type “Ghent” and press Enter."),
                    run: "search Ghent",
                    until: { trigger: DIALOG_ROW, text: "Roofing Ghent" },
                },
                {
                    trigger: DIALOG_ROW,
                    text: "Roofing Ghent",
                    bubble: _t("Pick “Roofing Ghent”"),
                    content: _t("Click “Roofing Ghent”: the window closes and the company is filled in."),
                    run: "click",
                    until: () =>
                        !findTarget({ trigger: DIALOG }) &&
                        (document.querySelector(COMPANY_INPUT)?.value || "").includes("Roofing Ghent"),
                },
                {
                    trigger: SAVE_BUTTON,
                    bubble: _t("Save"),
                    content: _t("Click the cloud to save Jean."),
                    run: "click",
                    until: formSaved(),
                },
            ],
        },
    ],
});
