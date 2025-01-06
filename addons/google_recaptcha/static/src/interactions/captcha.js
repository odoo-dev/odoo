/** @odoo-module **/

import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { ReCaptcha } from "@google_recaptcha/js/recaptcha";

export class RecaptchaForm extends Interaction {
    static selector = "form[data-captcha]";
    dynamicContent = {
        _root: { "t-on-submit": this._onSubmit },
    };

    setup() {
        this.recaptcha = new ReCaptcha();
    }

    async willStart() {
        this.recaptcha.loadLibs();
    }

    async _onSubmit(ev) {
        const submitEl = this.el.querySelector("button[type='submit']");
        if (!submitEl.getAttribute("disabled")) {
            submitEl.setAttribute("disabled", "disabled");
            const refreshIcon = document.createElement("i");
            refreshIcon.classList.add("fa", "fa-refresh", "fa-spin");
            this.insert(refreshIcon, submitEl, "afterbegin");
        }
        if (!this.el.querySelector("input[name='recaptcha_token_response']")) {
            ev.preventDefault();
            const action = this.el.dataset.captcha || "generic";
            const tokenCaptcha = await this.recaptcha.getToken(action);
            const inputEl = document.createElement("input");
            inputEl.name = "recaptcha_token_response";
            inputEl.type = "hidden";
            inputEl.value = tokenCaptcha.token;
            this.insert(inputEl, el);
            this.el.submit();
        }
    }
}

registry
    .category("public.interactions")
    .add("google_recaptcha.recaptcha_form", RecaptchaForm);
