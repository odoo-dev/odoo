odoo.define('mail.messaging.entity.Follower', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, many2one } = require('mail.messaging.EntityField');

function FollowerFactory({ Entity }) {

    class Follower extends Entity {

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
            if ('channel_id' in data) {
                if (!data.channel_id) {
                    data2.channel = [['unlink-all']];
                } else {
                    const channelData = {
                        id: data.channel_id,
                        model: 'mail.channel',
                        name: data.name,
                    };
                    data2.channel = [['insert', channelData]];
                }
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('is_active' in data) {
                data2.isActive = data.is_active;
            }
            if ('is_editable' in data) {
                data2.isEditable = data.is_editable;
            }
            if ('partner_id' in data) {
                if (!data.partner_id) {
                    data2.partner = [['unlink-all']];
                } else {
                    const partnerData = {
                        email: data.email,
                        id: data.partner_id,
                        name: data.name,
                    };
                    data2.partner = [['insert', partnerData]];
                }
            }
            return data2;
        }

        /**
         *  Close subtypes dialog
         */
        closeSubtypes() {
            this.env.messaging.dialogManager.close(this._subtypesListDialog);
            this._subtypesListDialog = undefined;
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
            await this.async(() => this.env.rpc({
                model: this.followedThread.model,
                method: 'message_unsubscribe',
                args
            }));
            this.delete();
        }

        /**
         * @param {mail.messaging.entity.FollowerSubtype} subtype
         */
        selectSubtype(subtype) {
            if (!this.selectedSubtypes.includes(subtype)) {
                this.update({ selectedSubtypes: [['link', subtype]] });
            }
        }

        /**
         * Show (editable) list of subtypes of this follower.
         */
        async showSubtypes() {
            const subtypesData = await this.async(() => this.env.rpc({
                route: '/mail/read_subscription_data',
                params: { follower_id: this.id },
            }));
            this.update({ subtypes: [['unlink-all']] });
            for (const data of subtypesData) {
                const subtype = this.env.entities.FollowerSubtype.insert(
                    this.env.entities.FollowerSubtype.convertData(data)
                );
                this.update({ subtypes: [['link', subtype]] });
                if (data.followed) {
                    this.update({ selectedSubtypes: [['link', subtype]] });
                } else {
                    this.update({ selectedSubtypes: [['unlink', subtype]] });
                }
            }
            this._subtypesListDialog = this.env.messaging.dialogManager.open('FollowerSubtypeList', {
                follower: [['replace', this]],
            });
        }

        /**
         * @param {mail.messaging.entity.FollowerSubtype} subtype
         */
        unselectSubtype(subtype) {
            if (this.selectedSubtypes.includes(subtype)) {
                this.update({ selectedSubtypes: [['unlink', subtype]] });
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
                await this.async(() => this.env.rpc({
                    model: this.followedThread.model,
                    method: 'message_subscribe',
                    args: [[this.followedThread.id]],
                    kwargs,
                }));
            }
            this.closeSubtypes();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @returns {string}
         */
        _computeName() {
            if (this.channel) {
                return this.channel.name;
            }
            if (this.partner) {
                return this.partner.name;
            }
            return '';
        }

        /**
         * @private
         * @returns {integer}
         */
        _computeResId() {
            if (this.partner) {
                return this.partner.id;
            }
            if (this.channel) {
                return this.channel.id;
            }
            return 0;
        }

        /**
         * @private
         * @returns {string}
         */
        _computeResModel() {
            if (this.partner) {
                return this.partner.model;
            }
            if (this.channel) {
                return this.channel.model;
            }
            return '';
        }

    }

    Follower.entityName = 'Follower';

    Follower.fields = {
        resId: attr({
            compute: '_computeResId',
            default: 0,
            dependencies: [
                'channelId',
                'partnerId',
            ],
        }),
        channel: many2one('Thread'),
        channelId: attr({
            related: 'channel.id',
        }),
        channelModel: attr({
            related: 'channel.model',
        }),
        channelName: attr({
            related: 'channel.name',
        }),
        followedThread: many2one('Thread', {
            inverse: 'followers',
        }),
        id: attr(),
        isActive: attr({
            default: true,
        }),
        isEditable: attr({
            default: false,
        }),
        name: attr({
            compute: '_computeName',
            dependencies: [
                'channelName',
                'partnerName',
            ],
        }),
        partner: many2one('Partner'),
        partnerId: attr({
            related: 'partner.id',
        }),
        partnerModel: attr({
            related: 'partner.model',
        }),
        partnerName: attr({
            related: 'partner.name',
        }),
        resModel: attr({
            compute: '_computeResModel',
            default: '',
            dependencies: [
                'channelModel',
                'partnerModel',
            ],
        }),
        selectedSubtypes: many2many('FollowerSubtype'),
        subtypes: many2many('FollowerSubtype'),
    };

    return Follower;
}

registerNewEntity('Follower', FollowerFactory);

});
