odoo.define('mail.messaging.entity.MessagingInitializer', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { one2one } = require('mail.messaging.EntityField');

function MessagingInitializerFactory({ Entity }) {

    class MessagingInitializer extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Fetch messaging data initially to populate the store specifically for
         * the current user. This includes pinned channels for instance.
         */
        async start() {
            await this.async(() => this.env.session.is_bound);

            this.env.entities.Thread.create({
                id: 'inbox',
                isPinned: true,
                model: 'mail.box',
                name: this.env._t("Inbox"),
            });
            this.env.entities.Thread.create({
                id: 'starred',
                isPinned: true,
                model: 'mail.box',
                name: this.env._t("Starred"),
            });
            this.env.entities.Thread.create({
                id: 'history',
                isPinned: true,
                model: 'mail.box',
                name: this.env._t("History"),
            });

            const device = this.messaging.device;
            device.start();
            const context = Object.assign({
                isMobile: device.isMobile,
            }, this.env.session.user_context);
            const discuss = this.messaging.discuss;
            const data = await this.async(() => this.env.rpc({
                route: '/mail/init_messaging',
                params: { context: context }
            }));
            this._init(data);
            if (discuss.isOpen) {
                discuss.openInitThread();
            }
            if (this.env.autofetchPartnerImStatus) {
                this.env.entities.Partner.startLoopFetchImStatus();
            }
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         * @param {Object} param0
         * @param {Object} param0.channel_slots
         * @param {Array} [param0.commands=[]]
         * @param {boolean} [param0.is_moderator=false]
         * @param {Object} [param0.mail_failures={}]
         * @param {Object[]} [param0.mention_partner_suggestions=[]]
         * @param {Object[]} [param0.moderation_channel_ids=[]]
         * @param {integer} [param0.moderation_counter=0]
         * @param {integer} [param0.needaction_inbox_counter=0]
         * @param {Array} param0.partner_root
         * @param {Object[]} [param0.shortcodes=[]]
         * @param {integer} [param0.starred_counter=0]
         */
        _init({
            channel_slots,
            commands = [],
            is_moderator = false,
            mail_failures = {},
            mention_partner_suggestions = [],
            menu_id,
            moderation_channel_ids = [],
            moderation_counter = 0,
            needaction_inbox_counter = 0,
            partner_root,
            public_partner,
            shortcodes = [],
            starred_counter = 0
        }) {
            const discuss = this.messaging.discuss;
            this._initPartners({
                moderation_channel_ids,
                partner_root,
                public_partner,
            });
            this._initChannels(channel_slots);
            this._initCommands(commands);
            this._initMailboxes({
                is_moderator,
                moderation_counter,
                needaction_inbox_counter,
                starred_counter,
            });
            this._initMailFailures(mail_failures);
            this._initCannedResponses(shortcodes);
            this._initMentionPartnerSuggestions(mention_partner_suggestions);
            discuss.update({ menu_id });
        }

        /**
         * @private
         * @param {Object[]} shortcodes
         */
        _initCannedResponses(shortcodes) {
            const messaging = this.messaging;
            const cannedResponses = shortcodes
                .map(s => {
                    const { id, source, substitution } = s;
                    return { id, source, substitution };
                })
                .reduce((obj, cr) => {
                    obj[cr.id] = cr;
                    return obj;
                }, {});
            messaging.update({ cannedResponses });
        }

        /**
         * @private
         * @param {Object} [param0={}]
         * @param {Object[]} [param0.channel_channel=[]]
         * @param {Object[]} [param0.channel_direct_message=[]]
         * @param {Object[]} [param0.channel_private_group=[]]
         */
        _initChannels({
            channel_channel = [],
            channel_direct_message = [],
            channel_private_group = [],
        } = {}) {
            for (const data of channel_channel.concat(channel_direct_message, channel_private_group)) {
                this.env.entities.Thread.insert(Object.assign(
                    {},
                    this.env.entities.Thread.convertData(data),
                    { isPinned: true }
                ));
            }
        }

        /**
         * @private
         * @param {Object[]} commandsData
         */
        _initCommands(commandsData) {
            const messaging = this.messaging;
            const commands = commandsData
                .map(command => {
                    return Object.assign({
                        id: command.name,
                    }, command);
                })
                .reduce((obj, command) => {
                    obj[command.id] = command;
                    return obj;
                }, {});
            messaging.update({ commands });
        }

        /**
         * @private
         * @param {Object} param0
         * @param {boolean} param0.is_moderator
         * @param {integer} param0.moderation_counter
         * @param {integer} param0.needaction_inbox_counter
         * @param {integer} param0.starred_counter
         */
        _initMailboxes({
            is_moderator,
            moderation_counter,
            needaction_inbox_counter,
            starred_counter,
        }) {
            const inbox = this.env.entities.Thread.find(thread =>
                thread.id === 'inbox' &&
                thread.model === 'mail.box'
            );
            const starred = this.env.entities.Thread.find(thread =>
                thread.id === 'starred' &&
                thread.model === 'mail.box'
            );
            inbox.update({ counter: needaction_inbox_counter });
            starred.update({ counter: starred_counter });
            if (is_moderator) {
                this.env.entities.Thread.create({
                    counter: moderation_counter,
                    id: 'moderation',
                    isPinned: true,
                    model: 'mail.box',
                    name: this.env._t("Moderation"),
                });
            }
        }

        /**
         * @private
         * @param {Object} mailFailuresData
         */
        _initMailFailures(mailFailuresData) {
            for (const messageData of mailFailuresData) {
                const message = this.env.entities.Message.insert(
                    this.env.entities.Message.convertData(messageData)
                );
                // implicit: failures are sent by the server at initialization
                // only if the current partner is author of the message
                if (!message.author && this.messaging.currentPartner) {
                    message.update({ author: [['link', this.messaging.currentPartner]] });
                }
            }
            this.messaging.notificationGroupManager.computeGroups();
            // manually force recompute of counter (after computing the groups)
            this.messaging.messagingMenu.update();
        }

        /**
         * @private
         * @param {Object[]} mentionPartnerSuggestionsData
         */
        _initMentionPartnerSuggestions(mentionPartnerSuggestionsData) {
            for (const suggestions of mentionPartnerSuggestionsData) {
                for (const suggestion of suggestions) {
                    const { email, id, name } = suggestion;
                    this.env.entities.Partner.insert({ email, id, name });
                }
            }
        }

        /**
         * @private
         * @param {Array} param0 partner root name get
         * @param {integer} param0[0] partner root id
         * @param {string} param0[1] partner root display_name
         */
        _initPartners({
            moderation_channel_ids = [],
            partner_root: [partnerRootId, partnerRootDisplayName],
            public_partner: [publicPartnerId, publicPartnerDisplayName],
        }) {
            this.messaging.update({
                currentPartner: [['insert', {
                    display_name: this.env.session.partner_display_name,
                    id: this.env.session.partner_id,
                    moderatedChannelIds: moderation_channel_ids,
                    name: this.env.session.name,
                    user: [['insert', { id: this.env.session.uid }]],
                }]],
                currentUser: [['insert', { id: this.env.session.uid }]],
                partnerRoot: [['insert', {
                    display_name: partnerRootDisplayName,
                    id: partnerRootId,
                }]],
                publicPartner: [['insert', {
                    display_name: publicPartnerDisplayName,
                    id: publicPartnerId,
                }]],
            });
        }

    }

    MessagingInitializer.entityName = 'MessagingInitializer';

    MessagingInitializer.fields = {
        messaging: one2one('Messaging', {
            inverse: 'initializer',
        }),
    };

    return MessagingInitializer;
}

registerNewEntity('MessagingInitializer', MessagingInitializerFactory);

});
