/** @odoo-module **/

import { addFields, addRecordMethods, patchModelMethods, patchRecordMethods } from '@mail/model/model_core';
import { one } from '@mail/model/model_field';
import { clear, insert, link, replace, unlink } from '@mail/model/model_field_command';
// ensure that the model definition is loaded before the patch
import '@mail/models/thread';

addFields('Thread', {
    /**
     * If set, current thread is a livechat.
     */
    messagingAsPinnedLivechat: one('Messaging', {
        compute: '_computeMessagingAsPinnedLivechat',
        inverse: 'pinnedLivechats',
    }),
});

addRecordMethods('Thread', {
    /**
     * @private
     * @returns {FieldCommand}
     */
    _computeMessagingAsPinnedLivechat() {
        if (!this.channel || this.channel.channel_type !== 'livechat' || !this.isPinned) {
            return clear();
        }
        return replace(this.messaging);
    },
});

patchModelMethods('Thread', {
    /**
     * @override
     */
    convertData(data) {
        const data2 = this._super(data);
        if ('livechat_visitor' in data && data.livechat_visitor) {
            if (!data2.members) {
                data2.members = [];
            }
            // `livechat_visitor` without `id` is the anonymous visitor.
            if (!data.livechat_visitor.id) {
                /**
                 * Create partner derived from public partner and replace the
                 * public partner.
                 *
                 * Indeed the anonymous visitor is registered as a member of the
                 * channel as the public partner in the database to avoid
                 * polluting the contact list with many temporary partners.
                 *
                 * But the issue with public partner is that it is the same
                 * record for every livechat, whereas every correspondent should
                 * actually have its own visitor name, typing status, etc.
                 *
                 * Due to JS being temporary by nature there is no such notion
                 * of polluting the database, it is therefore acceptable and
                 * easier to handle one temporary partner per channel.
                 */
                data2.members.push(unlink(this.messaging.publicPartners));
                const partner = this.messaging.models['Partner'].insert(
                    Object.assign(
                        this.messaging.models['Partner'].convertData(data.livechat_visitor),
                        { id: this.messaging.models['Partner'].getNextPublicId() }
                    )
                );
                data2.members.push(link(partner));
                data2.channel[0][1].correspondent = replace(partner);
            } else {
                const partnerData = this.messaging.models['Partner'].convertData(data.livechat_visitor);
                data2.members.push(insert(partnerData));
                data2.channel[0][1].correspondent = insert(partnerData);
            }
        }
        return data2;
    },
});

patchRecordMethods('Thread', {
    /**
     * @override
     */
    getMemberName(partner) {
        if (this.channel && this.channel.channel_type === 'livechat' && partner.livechat_username) {
            return partner.livechat_username;
        }
        return this._super(partner);
    },
    /**
     * @override
     */
    _computeDisplayName() {
        if (this.channel && this.channel.channel_type === 'livechat' && this.channel.correspondent) {
            if (this.channel.correspondent.country) {
                return `${this.channel.correspondent.nameOrDisplayName} (${this.channel.correspondent.country.name})`;
            }
            return this.channel.correspondent.nameOrDisplayName;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeHasInviteFeature() {
        if (this.channel && this.channel.channel_type === 'livechat') {
            return true;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeHasMemberListFeature() {
        if (this.channel && this.channel.channel_type === 'livechat') {
            return true;
        }
        return this._super();
    },
    /**
     * @override
     */
    _computeIsChatChannel() {
        return this.channel && this.channel.channel_type === 'livechat' || this._super();
    },
    /**
     * @override
     */
    _getDiscussSidebarCategory() {
        switch (this.channel.channel_type) {
            case 'livechat':
                return this.messaging.discuss.categoryLivechat;
        }
        return this._super();
    }
});
