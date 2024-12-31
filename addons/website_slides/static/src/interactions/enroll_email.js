import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { escape } from "@web/core/utils/strings";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

export class EnrollEmail extends Interaction {
    static selector = "#wrapwrap";
    dynamicContent = {
        ".o_wslides_js_channel_enroll": {
            "t-on-click.prevent.withTarget": this.openDialog,
        },
    };

    openDialog(ev, currentTargetEl) {
        const alert = currentTargetEl.closest(".alert");
        const channelId = parseInt(currentTargetEl.dataset.channelId);
        this.services.dialog.add(ConfirmationDialog, {
            title: _t("Request Access."),
            body: _t("Do you want to request access to this course?"),
            confirmLabel: _t("Yes"),
            confim: async () => {
                const { error, done } = await this.waitFor(
                    this.services.orm.call(
                        "slide.channel",
                        "action_request_access",
                        [channelId],
                    )
                );
                const message = done ? _t("Request sent!") : error || _t("Unknown error, try again.");
                alert.outerHTML = `
                    <div class="alert alert-${done ? "success" : "danger"}" role="alert">
                        <strong>${escape(message)}</strong>
                    </div>`;
            },
            cancelLabel: _t("Cancel"),
            cancel: () => { },
        });
    }
}

registry
    .category("public.interactions")
    .add("website_slides.enroll_email", EnrollEmail);
