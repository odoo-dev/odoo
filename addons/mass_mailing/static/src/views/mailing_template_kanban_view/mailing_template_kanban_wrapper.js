import { Component, props, t } from "@odoo/owl";
import { MailingTemplateKanbanRenderer } from "./mailing_template_kanban_renderer";

/**
 * A wrapper for the KanbanRender used to make smooth reload
 * of the renderer cards on each update.
 * This helps us avoid a full iframe reload, with all the stylesheet
 * load, on each update.
 */
export class MailingTemplateKanbanWrapper extends Component {
    static template = "mass_mailing.MailingTemplateKanbanWrapper";
    static components = { MailingTemplateKanbanRenderer };
    props = props({ kanbanRendererProps: t.signal(t.object()) });
}
