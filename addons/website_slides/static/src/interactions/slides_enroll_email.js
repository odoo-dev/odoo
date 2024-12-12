

import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

class WebsiteSlidesEnrollEmail extends Interaction {
    static selector = "#wrapwrap";
    dynamicContent = {
        ".o_wslides_js_channel_enroll": { "t-on-click.prevent": this.sendRequest(ev) },
    }

    async sendRequest(ev) {
        const channelId = parseInt(ev.currentTarget.dataset.channelId);
        await new Promise((resolve) =>
            this.services.dialog.add(ConfirmationDialog, {
                confirm: resolve,
                title: _t("Request Access."),
                body: _t("Do you want to request access to this course?"),
                confirmLabel: _t("Yes"),
                cancel: () => { }, // show cancel button
            })
        );
        const { error, done } = await this.services.orm.call(
            "slide.channel",
            "action_request_access",
            [channelId],
        );
        const alert = ev.currentTarget.closest(".alert");
        const message = done ? _t("Request sent!") : error || _t("Unknown error, try again.");
        alert.outerHTML = `
            <div class="alert alert-${done ? "success" : "danger"}" role="alert">
                <strong>${escape(message)}</strong>
            </div>`;
    }
}

registry
    .category("public.interactions")
    .add("website_slides.website_slides_enroll_email", WebsiteSlidesEnrollEmail);
