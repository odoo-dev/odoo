import { Interaction } from "@website/core/interaction";
import { registry } from "@web/core/registry";

import { _t } from "@web/core/l10n/translation";
import { parseDate, formatDate, serializeDate } from "@web/core/l10n/dates";

const { DateTime } = luxon;

const parse_date = function (value) {
    var date = parseDate(value);
    if (!date.isValid || date.year < 1900) {
        return false;
    }
    return serializeDate(date);
}

class CRMPartnerAssign extends Interaction {
    static selector = "#wrapwrap:has(.interested_partner_assign_form, .desinterested_partner_assign_form, .opp-stage-button, .new_opp_form)";
    dynamicContent = {
        ".interested_partner_assign_confirm": { "t-on-click.prevent.stop": this.blockedUntilDone(this.onInterestedPartnerAssignConfirm) },
        ".desinterested_partner_assign_confirm": { "t-on-click.prevent.stop": this.blockedUntilDone(this.confirmDesinterestedPartner) },
        ".opp-stage-button": { "t-on-click": this.blockedUntilDone(this.onOppStageButtonClick) },
        ".edit_contact_form .country_id": { "t-on-change": this.onEditContactFormChange },
        ".edit_contact_confirm": { "t-on-click.prevent.stop": this.blockedUntilDone(this.editContact) },
        ".new_opp_confirm": { "t-on-click.prevent.stop": this.blockedUntilDone(this.createOpportunity) },
        ".edit_opp_confirm": { "t-on-click.prevent.stop": this.blockedUntilDone(this.editOpportunity) },
        ".edit_opp_form .next_activity": { "t-on-change": this.onChangeNextActivity },
        "#new-opp-dialog .contact_name:": { "t-on-change": this.onChangeContactName },
    }

    async confirmInterestedPartner() {
        await this.services.orm.call("crm.lead", "partner_interested", [
            [parseInt(this.el.querySelector(".interested_partner_assign_form .assign_lead_id").value)],
            this.el.querySelector(".interested_partner_assign_form .comment_interested").value
        ]);
        window.location.href = '/my/leads';
    }

    async confirmDesinterestedPartner() {
        await this.services.orm.call("crm.lead", "partner_desinterested", [
            [parseInt(this.el.querySelector(".desinterested_partner_assign_form .assign_lead_id").value)],
            this.el.querySelector(".desinterested_partner_assign_form .comment_desinterested").value,
            this.el.querySelector(".desinterested_partner_assign_form .contacted_desinterested").checked,
            this.el.querySelector(".desinterested_partner_assign_form .customer_mark_spam").checked,
        ]);
        window.location.href = '/my/leads';
    }

    async changeOppStage(leadID, stageID) {
        await this.services.orm.write("crm.lead", [leadID], { stage_id: stageID }, {
            context: Object.assign({ website_partner_assign: 1 }),
        });
        window.location.reload();
    }

    async editContact() {
        await this.services.orm.call("crm.lead", "update_contact_details_from_portal", [
            [parseInt(this.el.querySelector(".edit_contact_form .opportunity_id").value)],
            {
                partner_name: this.el.querySelector(".edit_contact_form .partner_name").value,
                phone: this.el.querySelector(".edit_contact_form .phone").value,
                mobile: this.el.querySelector(".edit_contact_form .mobile").value,
                email_from: this.el.querySelector(".edit_contact_form .email_from").value,
                street: this.el.querySelector(".edit_contact_form .street").value,
                street2: this.el.querySelector(".edit_contact_form .street2").value,
                city: this.el.querySelector(".edit_contact_form .city").value,
                zip: this.el.querySelector(".edit_contact_form .zip").value,
                state_id: parseInt(this.el.querySelector(".edit_contact_form .state_id").selectedOptions[0].value),
                country_id: parseInt(this.el.querySelector(".edit_contact_form .country_id").selectedOptions[0].value),
            },
        ]);
        window.location.reload();
    }

    async createOpportunity() {
        const response = await this.services.orm.call("crm.lead", "create_opp_portal", [{
            contact_name: this.el.querySelector(".new_opp_form .contact_name").value,
            title: this.el.querySelector(".new_opp_form .title").value,
            description: this.el.querySelector(".new_opp_form .description").value,
        }])
        if (response.errors) {
            this.el.querySelector("#new-opp-dialog .alert")?.remove();
            const alertEl = this.el.createElement("div");
            alertEl.classList.add("alert", "alert-danger");
            alertEl.textContent = response.errors;
            const parentEl = this.el.querySelector("#new-opp-dialog");
            parentEl.insertBefore(alertEl, parentEl.firstElementChild);
        } else {
            window.location = '/my/opportunity/' + response.id;
        }
    }

    async editOpportunity() {
        await this.services.orm.call("crm.lead", "update_lead_portal", [
            [parseInt(this.el.querySelector(".edit_opp_form .opportunity_id").value)],
            {
                date_deadline: parse_date(this.el.querySelector(".edit_opp_form .date_deadline").value),
                expected_revenue: parseFloat(this.el.querySelector(".edit_opp_form .expected_revenue").value),
                probability: parseFloat(this.el.querySelector(".edit_opp_form .probability").value),
                activity_type_id: parseInt(this.el.querySelector(".edit_opp_form .next_activity").selectedOptions[0].getAttribute("data")),
                activity_summary: this.el.querySelector(".edit_opp_form .activity_summary").value,
                activity_date_deadline: parse_date(this.el.querySelector(".edit_opp_form .activity_date_deadline").value),
                priority: this.el.querySelector("input[name='PriorityRadioOptions']:checked").value,
            },
        ])
        window.location.reload();
    }

    async onInterestedPartnerAssignConfirm() {
        if (
            this.el.querySelector(".interested_partner_assign_form .comment_interested").value
            && this.el.querySelector(".interested_partner_assign_form .contacted_interested").checked) {
            await this.confirmInterestedPartner();
        } else {
            this.el.querySelector(".interested_partner_assign_form .error_partner_assign_interested").style.display = "block";
        }
    }

    async onOppStageButtonClick(ev) {
        await this.changeOppStage.bind(this, parseInt(ev.currentTarget.getAttribute("opp")), parseInt(ev.currentTarget.getAttribute("data")))
    }

    onEditContactFormChange() {
        var countryID = this.el.querySelector(".edit_contact_form .country_id").selectedOptions[0].value;
        this.el.querySelectorAll(".edit_contact_form .state").forEach(state => {
            state.style.display = state.getAttribute("country") != countryID ? "none" : "block";
        });
    }

    onChangeNextActivity() {
        const selectedEl = this.el.querySelector(".edit_opp_form .next_activity").selectedOptions[0];
        if (selectedEl.getAttribute("activity_summary")) {
            this.el.querySelector(".edit_opp_form .activity_summary").value = selectedEl.getAttribute("activity_summary");
        }
        if (selectedEl.getAttribute("delay_count")) {
            const value = +selectedEl.getAttribute("delay_count");
            const unit = selectedEl.getAttribute("delay_unit");
            const date = DateTime.now().plus({ [unit]: value });
            this.el.querySelector(".edit_opp_form .activity_date_deadline").value = formatDate(date);
        }
    }

    onChangeContactName(ev) {
        const contactName = ev.currentTarget.value.trim();
        let titleEl = this.el.querySelector('.title');
        if (!titleEl.value.trim()) {
            titleEl.value = contactName ? _t("%s's Opportunity", contactName) : '';
        }
    }
}

registry
    .category("public.interactions")
    .add("website_crm_partner_assign.crm_partner_assign", CRMPartnerAssign);
