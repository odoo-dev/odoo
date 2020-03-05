odoo.define('mail.messaging.entity.Follower', function (require) {
'use strict';

const {
    fields: {
        many2many,
        many2one,
    },
    registerNewEntity,
} = require('mail.messaging.entity.core');

function FollowerFactory({ Entity }) {

    class Follower extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         *  Close subtypes dialog
         */
        closeSubtypes() {
            this.env.messaging.dialogManager.close(this._subtypesListDialog);
            this._subtypesListDialog = undefined;
        }

        /**
         * @return {string}
         */
        get name() {
            if (this.channel) {
                return this.channel.name;
            }
            return this.partner.name;
        }

        /**
         * Remove this follower from its related thread.
         */
        async remove() {
            const args = [[this.followedThread.id]];
            if (this.partner) {
                args.push([this.partner.id]);
            } else {
                args.push([this.channel.id]);
            }
            await this.env.rpc({
                model: this.followedThread.model,
                method: 'message_unsubscribe',
                args
            });
            this.delete();
        }

        /**
         * @returns {integer}
         */
        get resId() {
            if (this.partner) {
                return this.partner.id;
            }
            if (this.channel) {
                return this.channel.id;
            }
            return 0;
        }

        /**
         * @returns {string}
         */
        get resModel() {
            if (this.partner) {
                return this.partner.model;
            }
            if (this.channel) {
                return this.channel.model;
            }
            return '';
        }

        /**
         * @param {mail.messaging.entity.FollowerSubtype} subtype
         */
        selectSubtype(subtype) {
            if (!this.selectedSubtypes.includes(subtype)) {
                this.link({ selectedSubtypes: subtype });
            }
        }

        /**
         * Show (editable) list of subtypes of this follower.
         */
        async showSubtypes() {
            const subtypesData = await this.env.rpc({
                route: '/mail/read_subscription_data',
                params: { follower_id: this.id },
            });
            this.unlink({ subtypes: null });
            for (const data of subtypesData) {
                const subtype = this.env.entities.FollowerSubtype.insert(data);
                this.link({ subtypes: subtype });
                if (data.followed) {
                    this.link({ selectedSubtypes: subtype });
                } else {
                    this.unlink({ selectedSubtypes: subtype });
                }
            }
            this._subtypesListDialog = this.env.messaging.dialogManager.open('FollowerSubtypeList', {
                follower: this,
            });
        }

        /**
         * @param {mail.messaging.entity.FollowerSubtype} subtype
         */
        unselectSubtype(subtype) {
            if (this.selectedSubtypes.includes(subtype)) {
                this.unlink({ selectedSubtypes: subtype });
            }
        }

        /**
         * Update server-side subscription of subtypes of this follower.
         */
        async updateSubtypes() {
            if (this.selectedSubtypes.length === 0) {
                this.remove();
            } else {
                const kwargs = {
                    subtype_ids: this.selectedSubtypes.map(subtype => subtype.id),
                };
                if (this.partner) {
                    kwargs.partner_ids = [this.partner.id];
                } else {
                    kwargs.channel_ids = [this.channel.id];
                }
                await this.env.rpc({
                    model: this.followedThread.model,
                    method: 'message_subscribe',
                    args: [[this.followedThread.id]],
                    kwargs,
                });
            }
            this.closeSubtypes();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object} data
         */
        _update(data) {
            const {
                channel_id,
                email,
                id,
                is_active: isActive,
                is_editable: isEditable,
                name,
                partner_id,
            } = data;

            Object.assign(this, {
                id,
                isActive,
                isEditable,
            });

            if (channel_id) {
                let channel = this.env.entities.Thread.channelFromId(channel_id);
                if (channel) {
                    channel.update({ name });
                } else {
                    channel = this.env.entities.Thread.insert({
                        id: channel_id,
                        model: 'mail.channel',
                        name,
                    });
                }
                this.link({ channel });
            }
            if (partner_id) {
                const partner = this.env.entities.Partner.insert({
                    email,
                    id: partner_id,
                    name,
                });
                this.link({ partner });
            }
        }
    }

    Follower.fields = {
        channel: many2one('Thread'),
        selectedSubtypes: many2many('FollowerSubtype'),
        followedThread: many2one('Thread', {
            inverse: 'followers',
        }),
        partner: many2one('Partner'),
        subtypes: many2many('FollowerSubtype'),
    };

    return Follower;
}

registerNewEntity('Follower', FollowerFactory);

});
