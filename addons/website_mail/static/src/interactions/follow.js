import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { ReCaptcha } from "@google_recaptcha/js/recaptcha";

export class Follow extends Interaction {
    static selector = "#wrapwrap:has(.js_follow)";

    setup() {
        this.isUser = false;
        this.recaptcha = new ReCaptcha();
    }

    async willStart() {
        return this.recaptcha.loadLibs();
    }

    start() {
        const jsFollowEls = this.el.querySelectorAll(".js_follow");

        var always = function (data) {
            this.isUser = data[0].is_user;
            for (const jsFollowEl of jsFollowEls) {
                const model = this.el.dataset.object;
                const email = data[0].email;
                const needToEnable = model in data[1] && data[1][model].includes(parseInt(this.el.dataset.id));
                this.toggleSubscription(needToEnable, email, jsFollowEl);
                jsFollowEl.classList.remove("d-none");
            }
        };

        const records = {};
        for (const jsFollowEl of jsFollowEls) {
            const model = this.el.dataset.object;
            if (!(model in records)) {
                records[model] = [];
            }
            records[model].push(parseInt(this.el.dataset.id));
        }

        rpc('/website_mail/is_follower', {
            records: records,
        }).then(always, always);

        this.finishStart();
    }

    finishStart() {
        document.querySelector(".js_follow > d-none").classList.remove("d-none");
        const btnEls = this.el.querySelectorAll(".js_follow_btn, .js_unfollow_btn");
        for (const btnEl of btnEls) {
            btnEl.addEventListener("click", (ev) => {
                ev.preventDefault();
                this.onClick(ev);
            })
        }
    }

    /**
     * Toggles subscription state for every given records.
     *
     * @param {boolean} follow
     * @param {string} email
     * @param {HTMLElement} jsFollowEl
     */
    toggleSubscription(follow, email, jsFollowEl) {
        this.updateSubscriptionDOM(follow || !email && jsFollowEl.dataset.unsubscribe, email, jsFollowEl);
    }

    /**
     * Updates subscription DOM for every given records.
     * This should not be called directly, use `toggleSubscription`.
     *
     * @param {boolean} follow
     * @param {string} email
     * @param {HTMLElement} jsFollowEl
     */
    updateSubscriptionDOM(follow, email, jsFollowEl) {
        jsFollowEl.querySelector("input.js_follow_email").value = email || "";
        jsFollowEl.querySelector("input.js_follow_email").setAttribute("disabled", email && (follow || this.isUser) ? "disabled" : false);
        jsFollowEl.dataset.follow = follow ? "on" : "off";
    }

    /**
     * @param {Event} ev
     */
    async onClick(ev) {
        var jsFollowEl = ev.currentTarget.closest(".js_follow");
        var email = jsFollowEl.querySelector(".js_follow_email");

        if (email && !$email.value.match(/.+@.+/)) {
            jsFollowEl.classList.add('o_has_error')
            const formEls = jsFollowEl.querySelectorAll('.form-control, .form-select')
            for (const formEl of formEls) {
                formEl.classList.add('is-invalid');
            }
            return false;
        }
        jsFollowEl.classList.remove('o_has_error')
        const formEls = jsFollowEl.querySelectorAll('.form-control, .form-select')
        for (const formEl of formEls) {
            formEl.classList.remove('is-invalid');
        }

        var email = !!email ? email.value : false;
        if (email || this.isUser) {
            const tokenCaptcha = await this.recaptcha.getToken("website_mail_follow");
            const token = tokenCaptcha.token;

            if (tokenCaptcha.error) {
                this.services.notification.add(tokenCaptcha.error, {
                    type: "danger",
                    title: _t("Error"),
                    sticky: true
                });
                return false;
            }
            rpc("/website_mail/follow", {
                "id": +jsFollow.dataset.id,
                "object": jsFollow.dataset.object,
                "message_is_follower": jsFollow.dataset.follow || "off",
                "email": email,
                "recaptcha_token_response": token
            }).then(function (follow) {
                this.toggleSubscription(follow, email, jsFollow);
            });
        }

    }
}

registry
    .category("public.interactions")
    .add("website_mail.follow", Follow);
