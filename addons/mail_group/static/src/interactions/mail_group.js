import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

export class MailGroup extends Interaction {
    static selector = ".o_mail_group";
    dynamicContent = {
        ".o_mg_subscribe_btn": { "t-on-click.prevent": this.onClickSubscribe },
    }

    setup() {
        this.mailgroupId = this.$el.data('id');
        this.isMember = this.$el.data('isMember') || false;
        const searchParams = (new URL(document.location.href)).searchParams;
        this.token = searchParams.get('token');
        this.forceUnsubscribe = searchParams.has('unsubscribe');
    }

    async onClickSubscribe() {
        const email = this.el.querySelector(".o_mg_subscribe_email").value;

        if (!email.match(/.+@.+/)) {
            this.el.classList.add("o_has_error")
            this.el.querySelector(".form-control, .form-select").classList.add("is-invalid");
            return false;
        }

        this.el.classList.remove("o_has_error")
        this.el.querySelector(".form-control, .form-select").classList.remove("is-invalid");

        const action = (this.isMember || this.forceUnsubscribe) ? 'unsubscribe' : 'subscribe';

        const response = await rpc('/group/' + action, {
            'group_id': this.mailgroupId,
            'email': email,
            'token': this.token,
        });

        this.el.querySelector(".o_mg_alert").remove();

        if (response === 'added') {
            this.isMember = true;
            const btnEl = this.el.querySelector(".o_mg_subscribe_btn");
            btnEl.innerText = _t('Unsubscribe');
            btnEl.classList.remove("btn-primary");
            btnEl.classList.add("btn-outline-primary");
        } else if (response === 'removed') {
            this.isMember = false;
            const btnEl = this.el.querySelector(".o_mg_subscribe_btn");
            btnEl.innerText = _t('Subscribe');
            btnEl.classList.add("btn-primary");
            btnEl.classList.remove("btn-outline-primary");
        } else if (response === 'email_sent') {
            // The confirmation email has been sent
            this.el.innerHTML = `<div class="o_mg_alert alert alert-success" role="alert"/>${_t('An email with instructions has been sent.')}</div>`;
        } else if (response === 'is_already_member') {
            this.isMember = true;
            const btnEl = this.el.querySelector(".o_mg_subscribe_btn");
            btnEl.innerText = _t('Unsubscribe');
            btnEl.classList.remove("btn-primary");
            btnEl.classList.add("btn-outline-primary");
            const divEl = document.createElement("div");
            divEl.classList.add("o_mg_alert alert alert-warning");
            divEl.setAttribute("role", "alert");
            divEl.innerText = _t('This email is already subscribed.');
            this.el.querySelector(".o_mg_subscribe_form").insertBefore(divEl);
        } else if (response === 'is_not_member') {
            if (!this.forceUnsubscribe) {
                this.isMember = false;
                this.el.querySelector(".o_mg_subscribe_btn").innerText = _t('Subscribe');
            }
            const divEl = document.createElement("div");
            divEl.classList.add("o_mg_alert alert alert-warning");
            divEl.setAttribute("role", "alert");
            divEl.innerText = _t('This email is not subscribed.');
            this.el.querySelector(".o_mg_subscribe_form").insertBefore(divEl);
        }
    }
}

registry
    .category("public.interactions")
    .add("mail_groupe.mail_group", MailGroup);
