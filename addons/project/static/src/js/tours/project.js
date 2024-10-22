/** @odoo-module **/

import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { stepUtils } from "@web_tour/tour_service/tour_utils";

import { markup } from "@odoo/owl";

registry.category("web_tour.tours").add('project_tour', {
    sequence: 110,
    url: "/web",
    rainbowManMessage: _t("Congratulations, you are now a master of project management."),
    steps: () => [stepUtils.showAppsMenuItem(), {
    isActive: ["community"],
    trigger: '.o_app[data-menu-xmlid="project.menu_main_pm"]',
    content: markup(_t('Want a better way to <b>manage your projects</b>? <i>It starts here.</i>')),
    position: 'right',
    run: "click",
}, {
    isActive: ["enterprise"],
    trigger: '.o_app[data-menu-xmlid="project.menu_main_pm"]',
    content: markup(_t('Want a better way to <b>manage your projects</b>? <i>It starts here.</i>')),
    position: 'bottom',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_project_kanban",
},
{
    trigger: '.o-kanban-button-new',
    content: markup(_t('Let\'s create your first <b>project</b>.')),
    position: 'bottom',
    run: "click",
}, {
    trigger: '.o_project_name input',
    content: markup(_t('Choose a <b>name</b> for your project. <i>It can be anything you want: the name of a customer, of a product, of a team, of a construction site, etc.</i>')),
    position: 'right',
    run: "edit Test",
}, {
    trigger: '.o_open_tasks',
    content: markup(_t('Let\'s create your first <b>project</b>.')),
    position: 'top',
    run: "click .modal:visible .btn.btn-primary",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_header input",
    content: markup(_t("Add columns to organize your tasks into <b>stages</b> <i>e.g. New - In Progress - Done</i>.")),
    position: 'bottom',
    run: "edit Test",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_add",
    content: markup(_t('Let\'s create your first <b>stage</b>.')),
    position: 'right',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_group",
},
{
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_header input",
    content: markup(_t("Add columns to organize your tasks into <b>stages</b> <i>e.g. New - In Progress - Done</i>.")),
    position: 'bottom',
    run: "edit Test",
}, {
    trigger: ".o_kanban_project_tasks .o_column_quick_create .o_kanban_add",
    content: markup(_t('Let\'s create your second <b>stage</b>.')),
    position: 'right',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_group:eq(1)",
},
{
    trigger: '.o-kanban-button-new',
    content: markup(_t("Let's create your first <b>task</b>.")),
    position: 'bottom',
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_project_tasks",
},
{
    trigger: '.o_kanban_quick_create div.o_field_char[name=display_name] input',
    content: markup(_t('Choose a task <b>name</b> <i>(e.g. Website Design, Purchase Goods...)</i>')),
    position: 'right',
    run: "edit Test",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_project_tasks",
},
{
    trigger: '.o_kanban_quick_create .o_kanban_add',
    content: _t("Add your task once it is ready."),
    position: "bottom",
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_project_tasks",
},
{
    trigger: ".o_kanban_record .oe_kanban_content",
    content: markup(_t("<b>Drag &amp; drop</b> the card to change your task from stage.")),
    position: "bottom",
    run: "drag_and_drop(.o_kanban_group:eq(1))",
}, 
{
    isActive: ["auto"],
    trigger: ".o_kanban_project_tasks",
},
{
    trigger: ".o_kanban_record:first",
    content: _t("Let's start working on your task."),
    position: "bottom",
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_form_project_tasks",
},
{
    trigger: ".o-mail-Chatter-topbar button:contains(Send message)",
    content: markup(_t("Use the chatter to <b>send emails</b> and communicate efficiently with your customers. Add new people to the followers' list to make them aware of the main changes about this task.")),
    position: "bottom",
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_form_project_tasks",
},
{
    trigger: "button:contains(Log note)",
    content: markup(_t("<b>Log notes</b> for internal communications <i>(the people following this task won't be notified of the note you are logging unless you specifically tag them)</i>. Use @ <b>mentions</b> to ping a colleague or # <b>mentions</b> to reach an entire team.")),
    position: "bottom",
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_form_project_tasks",
},
{
    trigger: ".o-mail-Chatter-topbar button:contains(Activities)",
    content: markup(_t("Create <b>activities</b> to set yourself to-dos or to schedule meetings.")),
    position: "bottom",
    run: "click",
}, 
{
    trigger: ".o_form_project_tasks",
    isActive: ["auto"],
},

{
    trigger: ".o_form_project_tasks",
},
{
    trigger: ".modal-dialog .btn-primary",
    content: _t("Schedule your activity once it is ready."),
    position: "bottom",
    run: "click",
},
{
    trigger: ".o_form_project_tasks",
    isActive: ["auto"],
},
{
    isActive: ["auto"],
    trigger: ".o_field_widget[name='user_ids'] input",
    content: _t("Assign a responsible to your task"),
    position: "right",
    run: "edit Admin",
},
{
    isActive: ["manual"],
    trigger: ".o_field_widget[name='user_ids']",
    content: _t("Assign a responsible to your task"),
    position: "right",
    run: "click",
},
{
    isActive: ["desktop", "auto"],
    trigger: "a.dropdown-item[id*='user_ids'] span",
    content: _t("Select an assignee from the menu"),
    run: "click",
},
{
    isActive: ["mobile"],
    trigger: "div.o_kanban_renderer > article.o_kanban_record",
    run: "click",
}, {
    isActive: ["auto"],
    trigger: 'a[name="sub_tasks_page"]',
    content: _t('Open sub-tasks notebook section'),
    run: 'click',
}, {
    isActive: ["auto"],
    trigger: '.o_field_subtasks_one2many .o_list_renderer a[role="button"]',
    content: _t('Add a sub-task'),
    run: 'click',
}, {
    isActive: ["auto"],
    trigger: '.o_field_subtasks_one2many div[name="name"] input',
    content: markup(_t('Give the sub-task a <b>name</b>')),
    run: "edit New Sub-task",
}, 
{
    isActive: ["auto"],
    trigger: ".o_form_project_tasks .o_form_dirty",
},
{
    isActive: ["auto"],
    trigger: ".o_form_button_save",
    content: markup(_t("You have unsaved changes - no worries! Odoo will automatically save it as you navigate.<br/> You can discard these changes from here or manually save your task.<br/>Let's save it manually.")),
    position: "bottom",
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_form_project_tasks",
},
{
    trigger: ".o_breadcrumb .o_back_button",
    content: markup(_t("Let's go back to the <b>kanban view</b> to have an overview of your next tasks.")),
    position: "right",
    run: 'click',
}, {
    isActive: ["auto"],
    trigger: ".o_kanban_record .oe_kanban_content .o_widget_subtask_counter .subtask_list_button",
    content: _t("You can open sub-tasks from the kanban card!"),
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".o_widget_subtask_kanban_list .subtask_list",
},
{
    isActive: ["auto"],
    trigger: ".o_kanban_record .o_widget_subtask_kanban_list .subtask_create",
    content: _t("Create a new sub-task"),
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".subtask_create_input",
},
{
    isActive: ["auto"],
    trigger: ".o_kanban_record .o_widget_subtask_kanban_list .subtask_create_input input",
    content: markup(_t("Give the sub-task a <b>name</b>")),
    run: "edit Newer Sub-task && click body",
}, {
    isActive: ["auto"],
    trigger: ".o_kanban_record .o_widget_subtask_kanban_list .subtask_list_row:first-child .o_field_project_task_state_selection button",
    content: _t("You can change the sub-task state here!"),
    run: "click",
}, 
{
    isActive: ["auto"],
    trigger: ".dropdown-menu",
},
{
    isActive: ["auto"],
    trigger: ".dropdown-menu span.text-danger",
    content: markup(_t("Mark the task as <b>Cancelled</b>")),
    run: "click",
}, {
    isActive: ["auto"],
    trigger: ".o_kanban_record .oe_kanban_content .o_widget_subtask_counter .subtask_list_button:contains('1/2')",
    content: _t("Close the sub-tasks list"),
    run: "click",
}, {
    isActive: ["auto"],
    trigger: '.o_kanban_renderer',
    // last step to confirm we've come back before considering the tour successful
    run: "click",
}]});
