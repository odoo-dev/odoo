import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";

import { rpc } from "@web/core/network/rpc";

export class Subscription extends Interaction {
    static selector = "#o_mailing_portal_subscription";
    dynamicSelectors = {
        ...this.dynamicSelectors,
        _blocklistAdd: () => this.blocklistEl.querySelector("#button_blocklist_add"),
        _blocklistRemove: () => this.blocklistEl.querySelector("#button_blocklist_remove"),
        _feedbackSend: () => this.feedbackEl.querySelector("#button_feedback"),
        _optOutEl: () => this.feedbackEl.querySelector(".o_mailing_subscription_opt_out_reason"),
        _formSend: () => this.formEl.querySelector("#button_form_send"),
        _updateEl: () => document.querySelector("#o_mailing_subscription_update_info"),
        _feedbackTextArea: () => this.feedbackEl.querySelector("textarea"),
        _feedbackInputs: () => this.feedbackEl.querySelectorAll("input"),
        _feedbackInfoEl: () => document.querySelector("o_mailing_subscription_feedback_info"),
        _feedbackPEl: () => this.feedbackEl.querySelector("p"),
        _feedbackEl: () => this.feedbackEl,
        _formBlockistEl: () => document.querySelector("#o_mailing_subscription_form_blocklisted"),
        _formManageEl: () => document.querySelector("#o_mailing_subscription_form_manage"),
    }
    dynamicContent = {
        _blocklistAdd: {
            "t-on-click.prevent": (ev) => this.onBlocklistUpdate(ev, true),
            "t-att-class": () => ({
                "d-none": !this.customerData.blocklistEnabled || !this.customerData.blocklistPossible || this.customerData.isBlocklisted,
            }),
        },
        _blocklistRemove: {
            "t-on-click.prevent": (ev) => this.onBlocklistUpdate(ev, false),
            "t-att-class": () => ({
                "d-none": !this.customerData.isBlocklisted,
            }),
        },
        _feedbackSend: {
            "t-on-click.prevent": this.onFeedbackSend,
            "t-att-disabled": () => this.isFeedbackReadOnly ? "disabled" : undefined,
        },
        _optOutEl: { "t-on-click.withTarget": this.onOptOutReasonClick },
        _formSend: { "t-on-click.prevent": this.onFormSend },
        _updateEl: {
            "t-att-class": () => ({
                "text-success": this.lastAction,
                "text-danger": !this.lastAction,
                "d-none": false,
            }),
        },
        _feedbackInfoEl: {
            "t-att-class": () => ({
                "text-success": this.lastAction,
                "text-danger": !this.lastAction,
                "d-none": false,
            }),
        },
        _feedbackInputs: {
            "t-att-disabled": () => this.isFeedbackReadOnly ? "disabled" : undefined,
        },
        _feedbackTextArea: {
            "t-att-disabled": () => this.isFeedbackReadOnly ? "disabled" : undefined,
            "t-att-class": () => ({ "d-none": this.customerData.feedbackEnabled }),
        },
        _feedbackEl: {
            "t-att-class": () => ({ "d-none": !this.customerData.feedbackEnabled }),
        },
        _formBlockistEl: {
            "t-att-class": () => ({ "d-none": !this.customerData.isBlocklisted }),
        },
        _formManageEl: {
            "t-att-class": () => ({ "d-none": this.customerData.isBlocklisted }),
        },

        _feedbackPEl: {
            "t-out": () => this.lastAction == "blocklist_add" ? _t("Please let us know why you want to be in our block list.") : _t("Please let us know why you updated your subscription."),
        },
    };

    setup() {
        this.blocklistEl = this.el.querySelector("#o_mailing_subscription_blocklist");
        this.feedbackEl = this.el.querySelector("#o_mailing_subscription_feedback");
        this.formEl = this.el.querySelector("#o_mailing_subscription_form");

        this.allowFeedback = false;
        this.isFeedbackReadOnly = false;

        this.customerData = { ...document.getElementById("o_mailing_portal_subscription").dataset };
        this.customerData.documentId = parseInt(this.customerData.documentId || 0);
        this.customerData.mailingId = parseInt(this.customerData.mailingId || 0);
        this.lastAction = this.customerData.lastAction;

        this.listInfo = [];
        const inputEls = document.querySelectorAll("#o_mailing_subscription_form_manage input");
        for (const inputEl of inputEls) {
            listInfo.push({
                id: parseInt(inputEl.getAttribute("value")),
                member: inputEl.dataset.member === "1",
                name: inputEl.getAttribute("title"),
                opt_out: inputEl.getAttribute("checked") !== "checked",
            });
        }
    }

    start() {
        this.clearFeedback();
    }

    clearFeedback() {
        document.querySelector("#o_mailing_subscription_feedback_info").innerHTML = "";
        this.feedbackEl.querySelector("textarea").value = "";
    }

    updateLastAction(infoKey) {
        this.lastAction = infoKey;
        this.clearFeedback();
    }

    async onBlocklistUpdate(ev, isAdding) {
        const result = await this.waitFor(rpc(`/mailing/blocklist/${isAdding ? "add" : "remove"}`, {
            document_id: this.customerData.documentId,
            email: this.customerData.email,
            hash_token: this.customerData.hashToken,
            mailing_id: this.customerData.mailingId,
        }));
        const success = result === true;
        this.updateLastAction(success ? (isAdding ? "blocklist_add" : "blocklist_remove") : false);
        if (result === true) {
            this.customerData.isBlocklisted = isAdding;
            this.customerData.feedbackEnabled = isAdding;
        }

        const updateInfo = document.getElementById("o_mailing_subscription_update_info");
        updateInfo.innerHTML = "";
        this.renderAt("mass_mailing.portal.blocklist_update_info", { infoKey: this.lastAction || "error" }, updateInfo);
    }

    async onFeedbackSend() {
        const formData = new FormData(document.querySelector('div#o_mailing_subscription_feedback form'));
        const optoutReasonId = parseInt(formData.get('opt_out_reason_id'));
        const result = await this.waitFor(rpc("/mailing/feedback", {
            csrf_token: formData.get("csrf_token"),
            document_id: this.customerData.documentId,
            email: this.customerData.email,
            feedback: formData.get("feedback"),
            hash_token: this.customerData.hashToken,
            last_action: this.lastAction,
            mailing_id: this.customerData.mailingId,
            opt_out_reason_id: optoutReasonId,
        }));
        const success = result === true;
        this.updateLastAction(success ? "feedback_sent" : false);

        const feedbackInfo = document.getElementById("o_mailing_subscription_feedback_info");
        feedbackInfo.innerHTML = "";
        this.renderAt("mass_mailing.portal.feedback_update_info", { infoKey: this.lastAction }, feedbackInfo);
        feedbackInfo.classList.add();
        feedbackInfo.classList.remove();
    }

    onOptOutReasonClick(ev, currentTargetEl) {
        this.allowFeedback = currentTargetEl.dataset.isFeedback;
    }

    async onFormSend() {
        const formData = new FormData(document.querySelector("div#o_mailing_subscription_form form"));
        const mailingListOptinIds = formData.getAll("mailing_list_ids").map(id_str => parseInt(id_str));
        const result = await this.waitFor(this.rpc("/mailing/list/update", {
            csrf_token: formData.get("csrf_token"),
            document_id: this.customerData.documentId,
            email: this.customerData.email,
            hash_token: this.customerData.hashToken,
            lists_optin_ids: mailingListOptinIds,
            mailing_id: this.customerData.mailingId,
        }));
        const hasJoined = (parseInt(result) > 0);
        const success = !["error", "unauthorized"].includes(result);
        this.updateLastAction(success ? (hasJoined ? "subscription_updated_optout" : "subscription_updated") : false);
        if (success) {
            this.customerData.feedbackEnabled = hasJoined;
        }
        this.updateDisplay(mailingListOptinIds);

        this.listInfo.forEach(
            (listItem) => {
                listItem.member = listItem.member || mailingListOptinIds.includes(listItem.id);
                listItem.opt_out = !mailingListOptinIds.includes(listItem.id);
            }
        );

        const manageForm = document.getElementById("o_mailing_subscription_form_manage");
        manageForm.innerHTML = "";
        this.renderAt("mass_mailing.portal.list_form_content", {
            listsMember: this.listInfo.filter(item => item.member === true),
            listsProposal: this.listInfo.filter(item => item.member === false),
        }, manageForm);

        const readonlyForm = document.getElementById("o_mailing_subscription_form_blocklisted");
        readonlyForm.innerHTML = "";
        this.renderAt("mass_mailing.portal.list_form_content_readonly", {
            listsOptin: this.listInfo.filter(item => item.opt_out === false),
        }, readonlyForm);

        const updateInfo = document.getElementById("o_mailing_subscription_update_info");
        updateInfo.innerHTML = "";
        this.renderAt("mass_mailing.portal.list_form_update_info", { infoKey: this.lastAction || "error" }, updateInfo);
    }
}

registry
    .category("public.interactions")
    .add("mass_mailing.subscription", Subscription);
