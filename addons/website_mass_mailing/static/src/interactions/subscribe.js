
import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { ReCaptcha } from "@google_recaptcha/js/recaptcha";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class Subscribe extends Interaction {
    static selector = ".js_subscribe";
    dynamicContent = {
        ".js_subscribe_btn": { "t-on-click": this.onClickSubscribe },
        _root: {
            "t-att-class": () => ({
                "d-none": false,
                "o_has_error": this.inError,
            }),
        },
        ".form-control": {
            "t-att-class": () => ({ "is-invalid": this.inError }),
        },
        ".js_subscribed_wrap": {
            "t-att-class": () => ({ "d-none": !this.isSubscriber }),
        },
        ".js_subscribe_wrap": {
            "t-att-class": () => ({ "d-none": this.isSubscriber }),
        },
        ".js_subscribe_btn": {
            "t-att-disabled": () => this.isSubscriber,
        },
        "input.js_subscribe_value, input.js_subscribe_email": {
            "t-att-disabled": () => this.isSubscriber,
            "t-att-value": () => "",
        },
    };

    setup() {
        this.inError = false;
        this.isSubscriber = false;
        this.recaptcha = new ReCaptcha();
    }

    async willStart() {
        this.recaptcha.loadLibs();
        const inputName = this.el.querySelector("input").name;
        this.isSubscriber = await this.waitFor(rpc("/website_mass_mailing/is_subscriber", {
            "list_id": this.getListId(),
            "subscription_type": inputName,
        }));
    }

    getListId() {
        return this.el.closest("[data-snippet='s_newsletter_block']").dataset.listId || this.el.dataset.listId;
    }

    async onClickSubscribe() {
        const inputName = this.el.querySelector("input").getAttribute("name");
        // js_subscribe_email is kept by compatibility (it was the old name of js_subscribe_value)
        const input = this.el.querySelector(".js_subscribe_value:visible, .js_subscribe_email:visible");
        if (inputName === "email" && input && !input.value.match(/.+@.+/)) {
            this.inError = true;
            return;
        }
        this.inError = false;
        const tokenObj = await this.recaptcha.getToken("website_mass_mailing_subscribe");
        if (tokenObj.error) {
            this.services.notification.add(tokenObj.error, {
                type: "danger",
                title: _t("Error"),
                sticky: true,
            });
            return;
        }
        const data = await this.waitFor(rpc("/website_mass_mailing/subscribe", {
            "list_id": this.getListId(),
            "value": input.value || false,
            "subscription_type": inputName,
            recaptcha_token_response: tokenObj.token,
        }));
        const toastType = data.toast_type;
        if (toastType === "success") {
            this.isSubscriber = true;
            this.el.closest(".o_newsletter_modal")?.style.display = "none";
        }
        this.services.notification.add(data.toast_content, {
            type: toastType,
            title: toastType === "success" ? _t("Success") : _t("Error"),
            sticky: true,
        });
    }
}

registry
    .category("public.interactions")
    .add("website_mass_mailing.subscribe", Subscribe);
