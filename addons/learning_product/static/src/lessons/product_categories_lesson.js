import { _t } from "@web/core/l10n/translation";
import { findTarget } from "@learning/core/dom_target";
import { formSaved } from "@learning/core/step_conditions";
import { lessonRegistry } from "@learning/lessons/lesson_registry";
import { menuSteps } from "@learning/lessons/menu_steps";

const CATEGORY_INPUT = ".o_form_view .o_field_widget[name=categ_id] input";
const PARENT_INPUT = ".o_dialog .o_field_widget[name=parent_id] input";
const PARENT_OPTION = ".o_dialog .o_field_widget[name=parent_id] .o-autocomplete--dropdown-item";
const PRODUCT_RECORD = ".o_kanban_record, .o_data_row .o_data_cell";

const valueOf = (selector) => document.querySelector(selector)?.value || "";

/**
 * From wherever the learner is to the product's form, through the menus of
 * this database (given by the checkpoint's setup).
 *
 * @param {{menuPath: {xmlid: string, name: string}[], productName: string}} params
 */
function findProductSteps({ menuPath = [], productName = "" }) {
    const steps = menuSteps(menuPath, _t("your products"));
    steps.push(
        {
            trigger: ".o_searchview_input",
            bubble: _t("Search “Copper”"),
            content: _t("To find a product, type a part of its name in the search bar, then press Enter."),
            run: "search Copper",
            // skipped when the product is already in sight
            until: { trigger: PRODUCT_RECORD, text: productName },
        },
        {
            trigger: PRODUCT_RECORD,
            text: productName,
            bubble: _t("Open “%s”", productName),
            content: _t("Here it is. Click “%s” to open it.", productName),
            run: "click",
            until: CATEGORY_INPUT,
        }
    );
    return steps;
}

lessonRegistry.add("product_categories", {
    name: _t("Organise products in categories"),
    intro: _t(
        "Find a product through the menus, put it in a category, and build a family of categories: Plumbing › Pipes."
    ),
    level: "C",
    sequence: 30,
    teaches: { fields: ["product.template.categ_id"] },
    focus: ["name", "categ_id", "parent_id"],
    checkpoints: [
        {
            key: "menu",
            steps: findProductSteps,
        },
        {
            key: "product",
            steps: [
                {
                    trigger: CATEGORY_INPUT,
                    bubble: _t("Type “Pipes”"),
                    content: _t("Categories sort your products into families. Type “Pipes” in the Category field."),
                    run: "edit Pipes",
                    until: ".o_field_widget[name=categ_id] .o_m2o_dropdown_option_create_edit",
                },
                {
                    trigger: ".o_field_widget[name=categ_id] .o_m2o_dropdown_option_create_edit",
                    bubble: _t("Create and edit…"),
                    content: _t(
                        "Choose “Create and edit…”: a window opens on top of your product to fill in the new category. Saving it brings you back here."
                    ),
                    run: "click",
                    until: PARENT_INPUT,
                    registerCreated: "product.category",
                },
                {
                    trigger: PARENT_INPUT,
                    bubble: _t("Type “Plumbing”"),
                    content: _t(
                        "This window is the new category “Pipes”. Pipes belong to plumbing: type “Plumbing” in Parent."
                    ),
                    run: "edit Plumbing",
                    until: { trigger: PARENT_OPTION, text: "Plumbing" },
                },
                {
                    trigger: PARENT_OPTION,
                    text: "Plumbing",
                    bubble: _t("Pick “Plumbing”"),
                    content: _t(
                        "Typing is not enough: pick “Plumbing” in the list. If it does not exist yet, Create “Plumbing” makes it right away, and you stay in this window."
                    ),
                    run: "click",
                    // picked: the suggestions closed and Plumbing stayed
                    until: () => !findTarget({ trigger: PARENT_OPTION }) && valueOf(PARENT_INPUT).includes("Plumbing"),
                },
                {
                    trigger: ".o_dialog .o_form_button_save",
                    bubble: _t("Save"),
                    content: _t("Save the new category. The window closes and you are back on your product."),
                    run: "click",
                    until: () => !document.querySelector(".o_dialog") && valueOf(CATEGORY_INPUT).includes("Pipes"),
                },
                {
                    trigger: ".o_form_view .o_form_button_save",
                    bubble: _t("Save"),
                    content: _t("Your product is now in Plumbing › Pipes. Click the cloud to keep it."),
                    run: "click",
                    until: formSaved(),
                },
            ],
        },
    ],
});
