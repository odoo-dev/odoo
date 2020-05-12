odoo.define('mail.messaging.entity.Partner', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, many2many, one2one } = require('mail.messaging.EntityField');

const utils = require('web.utils');

function PartnerFactory({ Entity }) {

    class Partner extends Entity {

        /**
         * @override
         */
        delete() {
            if (this.env.messaging) {
                if (this === this.env.messaging.currentPartner) {
                    this.env.messaging.update({ currentPartner: [['unlink-all']] });
                }
                if (this === this.env.messaging.partnerRoot) {
                    this.env.messaging.update({ partnerRoot: [['unlink-all']] });
                }
            }
            super.delete();
        }

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
            if ('userId' in data) {
                if (!data.userId) {
                    data2.user = [['unlink-all']];
                } else {
                    data2.user = [
                        ['insert', {
                            id: data.userId[0],
                            partnerDisplayName: data.userId[1],
                        }],
                    ];
                }
            }

            return data2;
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
            const chat = this.directPartnerThread;
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
        directPartnerThread: one2one('Thread', {
            inverse: 'directPartner',
        }),
        display_name: attr({
            default: "",
        }),
        email: attr(),
        id: attr(),
        im_status: attr(),
        memberThreads: many2many('Thread', {
            inverse: 'members',
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
