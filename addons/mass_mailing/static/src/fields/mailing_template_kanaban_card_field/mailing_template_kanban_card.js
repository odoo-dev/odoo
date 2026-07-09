import { Component, markup, onMounted, status } from "@odoo/owl";
import { localization } from "@web/core/l10n/localization";
import { registry } from "@web/core/registry";
import { renderToFragment } from "@web/core/utils/render";
import { useRef } from "@web/owl2/utils";

/**
 * A widget to display the mailing template's HTML content
 * inside an isolated shadowRoot, with its own stylesheets.
 */
export class MailingTemplateKanbanCard extends Component {
    static template = "mass_mailing.MailingTemplateKanbanCard";

    setup() {
        this.isRTL = localization.direction === "rtl";
        this.shadowRootRef = useRef("shadowRoot");
        this.styleSheets = [];
        onMounted(() => {
            this.env.styleSheetsPromise.then((styleSheets) => {
                if (status(this) === "destroyed") {
                    return;
                }
                this.styleSheets = styleSheets;
                this.setupShadowRoot();
            });
        });
    }

    setupShadowRoot() {
        const root = this.shadowRootRef.el.attachShadow({ mode: "open" });
        this.customStyleSheet = new this.shadowRootRef.el.ownerDocument.defaultView.CSSStyleSheet();
        this.customStyleSheet.replaceSync(`
            :host {
                display: block;
            }
            .o_mailing_template_preview {
                width: 600px;
                box-sizing: border-box;
            }`);
        root.adoptedStyleSheets = [
            ...root.adoptedStyleSheets,
            ...this.styleSheets,
            this.customStyleSheet,
        ];
        root.replaceChildren(this.renderBodyContent());
    }

    getTemplate(props = this.props) {
        return {
            bodyArch: markup(props.record.data.body_arch),
            id: props.record.id,
            modelId: props.record.data.mailing_model_id.id,
            modelName: props.record.data.mailing_model_id.display_name,
            name: `template_${props.record.id}`,
            nowrap: true,
            subject: props.record.data.subject,
            userId: props.record.data.user_id.id,
            userName: props.record.data.user_id.display_name,
        };
    }

    renderBodyContent() {
        return renderToFragment("mass_mailing.TemplateKanbanCardPreviewBody", {
            ...this.getTemplate(),
            isRTL: this.isRTL,
        });
    }
}

export const mailingTemplateKanban = {
    component: MailingTemplateKanbanCard,
};

registry.category("fields").add("mailing_template_kanban_card", mailingTemplateKanban);
