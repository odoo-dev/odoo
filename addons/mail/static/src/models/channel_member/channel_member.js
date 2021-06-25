/** @odoo-module **/

import { registerNewModel } from '@mail/model/model_core';
import { attr, many2one } from '@mail/model/model_field';
import { insert, unlink, insertAndReplace } from '@mail/model/model_field_command';

function factory(dependencies) {

    class ChannelMember extends dependencies['mail.model'] {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @param {Object} data
         * @returns {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('is_in_rtc_call' in data) {
                data2.isInRtcCall = data.is_in_rtc_call;
            }
            if ('is_muted' in data) {
                data2.isMuted = data.is_muted;
            }
            if ('is_deaf' in data) {
                data2.isDeaf = data.is_deaf;
            }
            if ('is_live' in data) {
                data2.isLive = data.is_live;
            }
            // relations
            if ('partner' in data) {
                if (!data.partner) {
                    data2.partner = unlink();
                } else {
                    const convertedPartnerData = this.env.models['mail.partner'].convertData(data.partner);
                    data2.partner = insertAndReplace(convertedPartnerData);
                }
            }
            return data2;
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @override
         */
        static _createRecordLocalId(data) {
            return `${this.modelName}_${data.id}`;
        }
    }

    ChannelMember.fields = {
        id: attr({
            required: true,
        }),
        isInRtcCall: attr({
            default: false,
        }),
        isMuted: attr({
            default: false,
        }),
        isLive: attr({
            default: false,
        }),
        isDeaf: attr({
            default: false,
        }),
        peerToken: attr({
            related: 'partner.peerToken',
        }),
        partner: many2one('mail.partner', {
            required: true,
        }),
        isOnline: attr({
            related: 'partner.isOnline',
        }),
        /**
         * Used for thread relation (thread.membersNameOrDisplayName)
         */
        nameOrDisplayName: attr({
            related: 'partner.nameOrDisplayName',
        }),
        /**
         * The thread for which it the the member of.
         */
        thread: many2one('mail.thread', {
            inverse: 'members',
            required: true,
        }),
    };

    ChannelMember.modelName = 'mail.channel_member';

    return ChannelMember;
}

registerNewModel('mail.channel_member', factory);
