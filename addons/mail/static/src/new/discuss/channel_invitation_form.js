/* @odoo-module */

import { Component, useRef, useState, onMounted, onWillStart } from "@odoo/owl";
import { useMessaging } from "@mail/new/messaging_hook";
import { PartnerImStatus } from "./partner_im_status";
import { Partner } from "../core/partner_model";

import { _t } from "@web/core/l10n/translation";
import { Thread } from "../core/thread_model";

export class ChannelInvitationForm extends Component {
    setup() {
        this.messaging = useMessaging();
        this.inputRef = useRef("input");
        this.searchStr = "";
        this.state = useState({
            selectablePartners: [],
            selectedPartners: [],
            searchResultCount: 0,
        });
        onWillStart(() => this.fetchPartnersToInvite());
        onMounted(() => {
            this.inputRef.el.focus();
        });
    }

    async fetchPartnersToInvite() {
        const results = await this.messaging.orm.call("res.partner", "search_for_channel_invite", [
            this.searchStr,
            this.props.threadId,
        ]);
        const Partners = results["partners"];
        const selectablePartners = [];
        for (const selectablePartner of Partners) {
            const partnerId = selectablePartner.id;
            const name = selectablePartner.name;
            const newPartner = Partner.insert(this.messaging.state, {
                id: partnerId,
                name: name,
            });
            selectablePartners.push(newPartner);
        }
        this.state.selectablePartners = selectablePartners;
        this.state.searchResultCount = results["count"];
    }

    onInput() {
        this.searchStr = this.inputRef.el.value;
        this.fetchPartnersToInvite();
    }

    onClickSelectablePartner(partner) {
        if (this.state.selectedPartners.includes(partner)) {
            const index = this.state.selectedPartners.indexOf(partner);
            if (index !== -1) {
                this.state.selectedPartners.splice(index, 1);
            }
            return;
        }
        this.state.selectedPartners.push(partner);
    }

    onClickSelectedPartner(partner) {
        const index = this.state.selectedPartners.indexOf(partner);
        this.state.selectedPartners.splice(index, 1);
    }

    onFocusInvitationLinkInput(ev) {
        ev.target.select();
    }

    async onClickCopy(ev) {
        await navigator.clipboard.writeText(this.thread.invitationLink);
        this.messaging.notify({
            message: _t("Link copied!"),
            type: "success",
        });
    }

    async onClickInvite() {
        await this.messaging.orm.call("mail.channel", "add_members", [[this.props.threadId]], {
            partner_ids: this.state.selectedPartners.map((partner) => partner.id),
        });
        if (this.env.isSmall) {
            this.props.chatState.activeMode = "";
        } else {
            this.props.close();
        }
    }

    get thread() {
        return this.messaging.state.threads[
            Thread.createLocalId({ model: "mail.channel", id: this.props.threadId })
        ];
    }
}

Object.assign(ChannelInvitationForm, {
    components: { PartnerImStatus },
    props: ["threadId", "close?", "chatState?"],
    template: "mail.channel_invitation_form",
});
