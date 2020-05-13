odoo.define('mail.messaging.entity.Partner', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, many2one, one2many, one2one } = require('mail.messaging.EntityField');

const utils = require('web.utils');

function PartnerFactory({ Entity }) {

    let nextPublicId = -1;

    class Partner extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * @static
         * @private
         * @param {Object} data
         * @return {Object}
         */
        static convertData(data) {
            const data2 = {};
            if ('country' in data) {
                if (!data.country) {
                    data2.country = [['unlink-all']];
                } else {
                    data2.country = [['insert', {
                        id: data.country[0],
                        name: data.country[1],
                    }]];
                }
            }
            if ('display_name' in data) {
                data2.display_name = data.display_name;
            }
            if ('email' in data) {
                data2.email = data.email;
            }
            if ('id' in data) {
                data2.id = data.id;
            }
            if ('im_status' in data) {
                data2.im_status = data.im_status;
            }
            if ('name' in data) {
                data2.name = data.name;
            }

            // relation
            if ('user_id' in data) {
                if (!data.user_id) {
                    data2.user = [['unlink-all']];
                } else {
                    data2.user = [
                        ['insert', {
                            id: data.user_id[0],
                            partnerDisplayName: data.user_id[1],
                        }],
                    ];
                }
            }

            return data2;
        }

        static getNextPublicId() {
            const id = nextPublicId;
            nextPublicId -= 1;
            return id;
        }

        /**
         * Search for partners matching `keyword`.
         *
         * @static
         * @param {Object} param0
         * @param {function} param0.callback
         * @param {string} param0.keyword
         * @param {integer} [param0.limit=10]
         */
        static async imSearch({ callback, keyword, limit = 10 }) {
            // prefetched partners
            let partners = [];
            const searchRegexp = new RegExp(
                _.str.escapeRegExp(utils.unaccent(keyword)),
                'i'
            );
            const currentPartner = this.env.messaging.currentPartner;
            for (const partner of this.all()) {
                if (partners.length < limit) {
                    if (
                        partner !== currentPartner &&
                        searchRegexp.test(partner.name)
                    ) {
                        partners.push(partner);
                    }
                }
            }
            if (!partners.length) {
                const partnersData = await this.env.rpc(
                    {
                        model: 'res.partner',
                        method: 'im_search',
                        args: [keyword, limit]
                    },
                    { shadow: true }
                );
                for (const data of partnersData) {
                    const partner = this.insert(data);
                    partners.push(partner);
                }
            }
            callback(partners);
        }

        /**
         * @static
         */
        static async startLoopFetchImStatus() {
            await this._fetchImStatus();
            this._loopFetchImStatus();
        }

        async checkIsUser() {
            const userIds = await this.async(() => this.env.rpc({
                model: 'res.users',
                method: 'search',
                args: [[['partner_id', '=', this.id]]],
            }));
            if (userIds.length) {
                this.update({ user: [['insert', { id: userIds[0] }]] });
            }
        }

        /**
         * Opens an existing or new chat.
         */
        openChat() {
            const chat = this.correspondentThreads.find(thread => thread.channel_type === 'chat');
            if (chat) {
                chat.open();
            } else {
                this.env.entities.Thread.createChannel({
                    autoselect: true,
                    partnerId: this.id,
                    type: 'chat',
                });
            }
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @static
         * @private
         * @param {Object} param0
         * @param {Object} param0.env
         */
        static async _fetchImStatus() {
            let toFetchPartnersLocalIds = [];
            let partnerIdToLocalId = {};
            const toFetchPartners = this.all(partner => partner.im_status !== null);
            for (const partner of toFetchPartners) {
                toFetchPartnersLocalIds.push(partner.localId);
                partnerIdToLocalId[partner.id] = partner.localId;
            }
            if (!toFetchPartnersLocalIds.length) {
                return;
            }
            const dataList = await this.env.rpc({
                route: '/longpolling/im_status',
                params: {
                    partner_ids: toFetchPartnersLocalIds.map(partnerLocalId =>
                        this.get(partnerLocalId).id
                    ),
                },
            }, { shadow: true });
            for (const { id, im_status } of dataList) {
                this.insert({ id, im_status });
                delete partnerIdToLocalId[id];
            }
            // partners with no im_status => set null
            for (const noImStatusPartnerLocalId of Object.values(partnerIdToLocalId)) {
                const partner = this.get(noImStatusPartnerLocalId);
                if (partner) {
                    partner.update({ im_status: null });
                }
            }
        }

        /**
         * @static
         * @private
         */
        static _loopFetchImStatus() {
            setTimeout(async () => {
                await this._fetchImStatus();
                this._loopFetchImStatus();
            }, 50 * 1000);
        }

        /**
         * @private
         * @returns {string}
         */
        _computeNameOrDisplayName() {
            return this.name || this.display_name;
        }

        /**
         * @override
         */
        _createInstanceLocalId(data) {
            return `${this.constructor.entityName}_${data.id}`;
        }

    }

    Partner.entityName = 'Partner';

    Partner.fields = {
        correspondentThreads: one2many('Thread', {
            inverse: 'correspondent',
        }),
        country: many2one('Country'),
        display_name: attr({
            default: "",
        }),
        email: attr(),
        failureNotifications: one2many('Notification', {
            related: 'messagesAsAuthor.failureNotifications',
        }),
        id: attr(),
        im_status: attr(),
        memberThreads: many2many('Thread', {
            inverse: 'members',
        }),
        messagesAsAuthor: one2many('Message', {
            inverse: 'author',
        }),
        model: attr({
            default: 'res.partner',
        }),
        moderatedChannelIds: attr({
            default: [],
        }),
        name: attr(),
        nameOrDisplayName: attr({
            compute: '_computeNameOrDisplayName',
            dependencies: [
                'display_name',
                'name',
            ],
        }),
        user: one2one('User', {
            inverse: 'partner',
        }),
    };

    return Partner;
}

registerNewEntity('Partner', PartnerFactory);

});
