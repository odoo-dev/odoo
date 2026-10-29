import { providePlugins } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { formView } from "@web/views/form/form_view";
import { FormController } from "@web/views/form/form_controller";
import { FormRenderer } from "@web/views/form/form_renderer";
import { StatusBarButtons } from "@web/views/form/status_bar_buttons/status_bar_buttons";
import { MailingPreviewPlugin } from "@mass_mailing/components/mailing_preview_iframe/mailing_preview_plugin";

class MailingPreviewFormController extends FormController {
    setup() {
        super.setup();
        providePlugins([MailingPreviewPlugin]);
    }
}

class MailingPreviewStatusBar extends StatusBarButtons {
    static template = "mass_mailing.MailingPreviewStatusbar";
}

class MailingPreviewFormRenderer extends FormRenderer {
    static components = {
        ...FormRenderer.components,
        StatusBarButtons: MailingPreviewStatusBar,
    };
}

registry.category("views").add("mailing_preview_form_view", {
    ...formView,
    Controller: MailingPreviewFormController,
    Renderer: MailingPreviewFormRenderer,
});
