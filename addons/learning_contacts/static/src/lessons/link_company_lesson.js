import { _t } from "@web/core/l10n/translation";
import { findTarget } from "@learning/core/dom_target";
import { formSaved } from "@learning/core/step_conditions";
import {
    AUTOCOMPLETE_OPTION,
    BACK_TO_LIST,
    fieldInput,
    SAVE_BUTTON,
} from "@learning/lessons/common_selectors";
import { lessonRegistry } from "@learning/lessons/lesson_registry";

const COMPANY = ".o_form_view .o_field_widget[name=parent_id]";
const COMPANY_INPUT = fieldInput("parent_id");
const COMPANY_OPTION = `${COMPANY} ${AUTOCOMPLETE_OPTION}`;
/** Suggestions of existing contacts (not "Create…" nor "Search more…"). */
const EXISTING_COMPANY = `${COMPANY_OPTION}:not(.o_m2o_dropdown_option)`;
const CREATE_COMPANY = `${COMPANY} .o_m2o_dropdown_option_create`;

const companyValue = () => document.querySelector(COMPANY_INPUT)?.value?.trim() || "";
/** Done once a company was picked: the suggestions closed and the field is filled. */
const companyPicked = (accept = () => true) => () =>
    !findTarget({ trigger: COMPANY_OPTION }) && companyValue() !== "" && accept(companyValue());

/**
 * @param {{person: string, company: string}} params the person and the
 *      suggested company from the setup; `company` is replaced by the one the
 *      learner actually picks
 */
function linkCompanySteps({ person, company }) {
    return [
        {
            trigger: COMPANY_INPUT,
            bubble: _t("Type “Dupont”"),
            content: _t(
                "%(person)s works for %(company)s. In the Company field, type the first letters of the company, for example “Dupont”: Odoo suggests the contacts that match.",
                { person, company }
            ),
            run: "edit Dupont",
            // any spelling will do, as long as the company shows up
            until: { trigger: EXISTING_COMPANY, text: company },
        },
        {
            trigger: EXISTING_COMPANY,
            text: company,
            bubble: _t("Pick “%s”", company),
            content: _t(
                "Pick the company in the list. Typing is not enough: the link is made when you pick."
            ),
            run: "click",
            until: companyPicked(),
            remember: { key: "company", from: COMPANY_INPUT },
        },
        {
            trigger: `${COMPANY} .o_external_button`,
            revealedOnHover: true,
            bubble: _t("Click →"),
            content: _t(
                "%(person)s is now linked to the company. The arrow → next to it opens the company (point at the company name to see it). Click it.",
                { person }
            ),
            run: "click",
            until: { trigger: ".o_last_breadcrumb_item", text: company },
        },
        {
            trigger: ".o_notebook .nav-link",
            text: _t("Contacts"),
            bubble: _t("Open Contacts"),
            content: _t("This is the company. Its Contacts tab lists the people working there."),
            run: "click",
            // skipped when the tab is already open
            until: { trigger: ".o_field_widget[name=child_ids] .o_kanban_record", text: person },
        },
        {
            trigger: BACK_TO_LIST,
            bubble: _t("Back to %s", person),
            content: _t(
                "%(person)s is there: a link works both ways. Go back to %(person)s with the breadcrumb at the top.",
                { person }
            ),
            run: "click",
            until: { trigger: ".o_last_breadcrumb_item", text: person },
        },
        {
            trigger: COMPANY_INPUT,
            bubble: _t("Type “Martin Heating”"),
            content: _t(
                "%(person)s changed jobs, for a company that is not in Odoo yet. Replace the company with a new name, for example “Martin Heating”.",
                { person }
            ),
            run: "edit Martin Heating",
            until: CREATE_COMPANY,
        },
        {
            trigger: CREATE_COMPANY,
            bubble: _t("Create it"),
            content: _t(
                "Choose Create “…”: the company is created right away, and you stay on %s.",
                person
            ),
            run: "click",
            until: companyPicked((value) => value !== company),
            registerCreated: "res.partner",
        },
        {
            trigger: SAVE_BUTTON,
            bubble: _t("Save"),
            content: _t("Click the cloud to save %s.", person),
            run: "click",
            until: formSaved(),
        },
    ];
}

lessonRegistry.add("link_company", {
    name: _t("Link a person to a company"),
    intro: _t(
        "Connect a person to the company they work for, follow the link both ways, and create a company on the fly."
    ),
    level: "B",
    sequence: 20,
    teaches: { fields: ["res.partner.parent_id"] },
    focus: ["name", "parent_id"],
    checkpoints: [{ key: "start", steps: linkCompanySteps }],
});
