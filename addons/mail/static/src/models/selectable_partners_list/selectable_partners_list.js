/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, many2many, many2one, one2many, one2one } from '@mail/model/model_field';
import { link, replace, unlink, unlinkAll } from '@mail/model/model_field_command';
import { cleanSearchTerm } from '@mail/utils/utils';

function factory(dependencies) {

    class SelectablePartnersList extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @param {mail.partner} partner
         * @returns {boolean}
         */
        isPartnerSelected(partner) {
            return this.selectedPartners.includes(partner);
        }

        /**
         * @param {Event} ev
         */
        async onClickCreateGroupChat(ev) {
            await this.env.messaging.openGroupChat(this.selectedPartners);
            this.update({
                inputSearch: "",
                selectedPartners: unlinkAll(),
            });
        }

        /**
         * @param {Event} ev
         */
        async onClickInviteGroupChat(ev) {
            await this.env.services.rpc(({
                model: 'mail.channel',
                method: 'channel_invite',
                args: [this.thread.id],
                kwargs: {
                    partner_ids: this.selectedPartners.map(partner => partner.id),
                },
            }));
            this.update({
                inputSearch: "",
                selectedPartners: unlinkAll(),
            });
        }

        /**
         * @param {Event} ev
         * @param {mail.partner} partner
         */
        onClickPartner(ev, partner) {
            if (this.isPartnerSelected(partner)) {
                this.update({ selectedPartners: unlink(partner) });
                return;
            }
            this.update({ selectedPartners: link(partner) });
        }

        /**
         * @param {Event} ev
         * @param {mail.partner} partner
         */
        onInputPartnerCheckbox(ev, partner) {
            if (!ev.target.checked) {
                this.update({ selectedPartners: unlink(partner) });
                return;
            }
            this.update({ selectedPartners: link(partner) });
        }

        /**
         * @param {Event} ev
         * @param {mail.partner} partner
         */
        async onInputSearch(ev) {
            this.update({ inputSearch: ev.target.value });
            // TODO have a smart queue like for mentions
            const partnersData = await this.env.services.rpc(
                {
                    model: 'res.partner',
                    method: 'im_search',
                    args: [this.inputSearch, 8]
                },
                { shadow: true }
            );
            this.env.models['mail.partner'].insert(
                partnersData.map(partnerData => this.env.models['mail.partner'].convertData(partnerData))
            );
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {mail.messaging}
         */
        _computeMessaging() {
            if (this.messagingAsInvitePartnerList) {
                return link(this.messagingAsInvitePartnerList);
            }
            return link(this.thread.messaging);
        }

        /**
         * @private
         * @returns {mail.partner[]}
         */
        _computeSelectablePartners() {
            if (!this.env.messaging) {
                return;
            }
            const cleanedSearchTerm = cleanSearchTerm(this.inputSearch);
            const partners = [];
            for (const partner of this.env.models['mail.partner'].all()) {
                if (
                    (!partner.active && partner !== this.env.messaging.partnerRoot) ||
                    partner.id <= 0 ||
                    this.env.messaging.publicPartners.includes(partner)
                ) {
                    // ignore archived partners (except OdooBot), temporary
                    // partners (livechat guests), public partners (technical)
                    continue;
                }
                if (this.thread && this.thread.channel_type !== 'chat' && this.thread.members.includes(partner)) {
                    continue;
                }
                if (!partner.user) {
                    continue;
                }
                if (
                    (partner.nameOrDisplayName && cleanSearchTerm(partner.nameOrDisplayName).includes(cleanedSearchTerm)) ||
                    (partner.email && cleanSearchTerm(partner.email).includes(cleanedSearchTerm))
                ) {
                    partners.push(partner);
                }
            }
            const sortedPartners = partners.concat(this.selectedPartners).sort(this.env.models['mail.partner'].getSuggestionSortFunction(this.inputSearch, {
                thread: this.thread,
            }));
            return [replace(sortedPartners), unlink(this.env.messaging.currentPartner)];
        }

        /**
         * @private
         * @returns {mail.partner[]}
         */
        _computeSelectedPartners() {
            if (!this.thread) {
                return;
            }
            if (this.thread.channel_type !== 'chat') {
                return;
            }
            return link(this.thread.members);
        }
    }

    SelectablePartnersList.fields = {
        /**
         * Serves as compute dependency.
         */
        allPartners: many2many('mail.partner', {
            related: 'messaging.allPartners',
        }),
        /**
         * Serves as compute dependency.
         */
        allPartnersEmail: attr({
            related: 'allPartners.email',
        }),
        /**
         * Serves as compute dependency.
         */
        allPartnersNameOrDisplayName: attr({
            related: 'allPartners.nameOrDisplayName',
        }),
        /**
         * Serves as compute dependency.
         */
        allPartnersUser: many2many('mail.user', {
            related: 'allPartners.user',
        }),
        /**
         * Serves as compute dependency.
         */
        allPartnersUserIsInternalUser: attr({
            related: 'allPartnersUser.isInternalUser',
        }),
        /**
         * Determines the search term used to filter this list.
         */
        inputSearch: attr({
            default: "",
        }),
        /**
         * Serves as compute dependency.
         */
        messaging: many2one('mail.messaging', {
            compute: '_computeMessaging',
        }),
        /**
         * Serves as compute dependency.
         */
        messagingAsInvitePartnerList: one2one('mail.messaging', {
            inverse: 'invitePartnersList',
        }),
        /**
         * Serves as compute dependency.
         */
        messagingCurrentPartner: many2many('mail.partner', {
            related: 'messaging.currentPartner',
        }),
        /**
         * Serves as compute dependency.
         */
        messagingPartnerRoot: many2many('mail.partner', {
            related: 'messaging.partnerRoot',
        }),
        /**
         * Serves as compute dependency.
         */
        messagingPublicPartners: many2many('mail.partner', {
            related: 'messaging.publicPartners',
        }),
        /**
         * States all partners that are potential choices according to this
         * search term, or that are already selected,
         */
        selectablePartners: many2many('mail.partner', {
            compute: '_computeSelectablePartners',
            dependencies: [
                'allPartners',
                'allPartnersEmail',
                'allPartnersNameOrDisplayName',
                'allPartnersUser',
                'allPartnersUserIsInternalUser',
                'inputSearch',
                'messaging',
                'messagingCurrentPartner',
                'messagingPartnerRoot',
                'messagingPublicPartners',
                'selectedPartners',
                'thread',
                'threadChannelType',
                'threadMembers',
                'threadModel',
            ],
            readonly: true,
        }),
        /**
         * Determines all partners that are currently selected.
         */
        selectedPartners: many2many('mail.partner', {
            compute: '_computeSelectedPartners',
            dependencies: [
                'thread',
                'threadChannelType',
                'threadMembers',
            ],
        }),
        /**
         * States the thread on which this list operates (if any).
         */
        thread: one2one('mail.thread', {
            inverse: 'invitePartnerList',
        }),
        /**
         * Serves as compute dependency.
         */
        threadChannelType: attr({
            related: 'thread.channel_type',
        }),
        /**
         * Serves as compute dependency.
         */
        threadMembers: many2many('mail.partner', {
            related: 'thread.members',
        }),
        /**
         * Serves as compute dependency.
         */
        threadModel: attr({
            related: 'thread.model',
        }),
    };

    SelectablePartnersList.modelName = 'mail.selectable_partners_list';

    return SelectablePartnersList;
}

registerNewModel('mail.selectable_partners_list', factory);
