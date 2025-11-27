import { Plugin } from "@html_editor/plugin";
import { registry } from "@web/core/registry";

class NoUnsubcriptionPlugin extends Plugin {
    static id = "noUnsubscriptionPlugin";

    resources = {
        on_mailing_model_updated_handlers: this.onMailingModelUpdated.bind(this),
    };

    setup() {
        this.onMailingModelUpdated();
    }

    onMailingModelUpdated() {
        const unsubEl = this.editable.querySelector(".o_layout.o_basic_theme .unsubscribe_link");
        if (!unsubEl) {
            return;
        }
        if (this.config.getRecordInfo?.().data.mailing_model_real == "hr.employee") {
            unsubEl.style.display = "none";
        } else {
            unsubEl.style.display = null;
        }
    }
}

registry.category("basic-editor-plugins").add(NoUnsubcriptionPlugin.id, NoUnsubcriptionPlugin);
