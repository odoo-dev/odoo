import { useSubEnv } from "@web/owl2/utils";
import { getStyleSheets } from "../../util/assets_utils";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";
import { onMounted, useScope } from "@odoo/owl";
import { MailingTemplateKanbanRecord } from "./mailing_template_kanban_record";

export class MailingTemplateKanbanRenderer extends KanbanRenderer {
    static components = {
        ...KanbanRenderer.components,
        KanbanRecord: MailingTemplateKanbanRecord,
    };
    setup() {
        const { promise, resolve, reject } = Promise.withResolvers();
        const scope = useScope();
        // TODO: change to use plugins (OWL-3) instead of useSubEnv.
        useSubEnv({
            styleSheetsPromise: promise,
        });
        onMounted(() => {
            const iframe = this.rootRef.el.ownerDocument.defaultView.frameElement;
            getStyleSheets(scope, iframe).then(
                (result) => resolve(result),
                (reason) => reject(reason)
            );
            // Hide the scroll bar of the document. Only keep the one of the iframe
            document.body.querySelector(".o_content").style.overflow = "hidden";
        });
        super.setup();
    }
}
