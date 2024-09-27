/** @odoo-module */

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

import { markup } from "@odoo/owl";

registry.category("web_tour.tours").add('survey_tour', {
    url: "/web",
    rainbowManMessage: _t("Congratulations! You are now ready to collect feedback like a pro :-)"),
    sequence: 225,
    steps: () => [
    ...stepUtils.goToAppSteps('survey.menu_surveys', markup(_t("Ready to change the way you <b>gather data</b>?"))),
{
    trigger: '.btn-outline-primary.o_survey_load_sample',
    content: markup(_t("Load a <b>sample Survey</b> to get started quickly.")),
    position: 'left',
    run: "click",
}, {
    trigger: 'button[name=action_test_survey]',
    content: _t("Let's give it a spin!"),
    position: 'bottom',
    run: "click",
}, {
    trigger: 'button[type=submit]',
    content: _t("Let's get started!"),
    position: 'bottom',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: '.js_question-wrapper span:contains("How frequently")',
},
{
    trigger: 'button[type=submit]',
    content: _t("Whenever you pick an answer, Odoo saves it for you."),
    position: 'bottom',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: '.js_question-wrapper span:contains("How many")',
},
{
    trigger: 'button[type=submit]',
    content: _t("Only a single question left!"),
    position: 'bottom',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: '.js_question-wrapper span:contains("How likely")',
},
{
    trigger: 'button[value=finish]',
    content: _t("Now that you are done, submit your form."),
    position: 'bottom',
    run: "click",
}, {
    trigger: '.o_survey_review',
    content: _t("Let's have a look at your answers!"),
    position: 'bottom',
    run: "click",
}, {
    trigger: '.survey_button_form_view_hook',
    content: _t("Now, use this shortcut to go back to the survey."),
    position: 'bottom',
    run: "click",
}, {
    trigger: 'button[name=action_survey_user_input_completed]',
    content: _t("Here, you can overview all the participations."),
    position: 'bottom',
    run: "click",
}, {
    trigger: 'td[name=survey_id]',
    content: _t("Let's open the survey you just submitted."),
    position: 'bottom',
    run: "click",
}, {
    trigger: '.breadcrumb a:contains("Feedback Form")',
    content: _t("Use the breadcrumbs to quickly go back to the dashboard."),
    position: 'bottom',
    run: "click",
}
]});
