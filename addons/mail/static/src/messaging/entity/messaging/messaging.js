odoo.define('mail.messaging.entity.Messaging', function (require) {
'use strict';

const { registerNewEntity } = require('mail.messaging.entityCore');
const { attr, one2one } = require('mail.messaging.EntityField');

function MessagingFactory({ Entity }) {

    class Messaging extends Entity {

        //----------------------------------------------------------------------
        // Public
        //----------------------------------------------------------------------

        /**
         * Open the form view of the record with provided id and model.
         *
         * @param {Object} param0
         * @param {integer} param0.id
         * @param {string} param0.model
         */
        openDocument({ id, model }) {
            this.env.do_action({
                type: 'ir.actions.act_window',
                res_model: model,
                views: [[false, 'form']],
                res_id: id,
            });
            this.messagingMenu.close();
            this.chatWindowManager.closeAll();
        }

        /**
         * Handles redirection to a model and id. Try to handle it in the context
         * of messaging (e.g. open chat if this is a user), otherwise fallback to
         * opening form view of record.
         *
         * @param {Object} param0
         * @param {integer} param0.id
         * @param {string} param0.model
         * FIXME needs to be tested and maybe refactored (see task-2244279)
         */
        async redirect({ id, model }) {
            if (model === 'mail.channel') {
                const channel = this.env.entities.Thread.find(thread =>
                    thread.id === id &&
                    thread.model === 'mail.channel'
                );
                if (!channel || !channel.isPinned) {
                    this.env.entities.Thread.joinChannel(id, { autoselect: true });
                    return;
                }
                channel.open();
            } else if (model === 'res.partner') {
                if (id === this.currentPartner.id) {
                    this.openDocument({
                        model: 'res.partner',
                        id,
                    });
                    return;
                }
                const partner = this.env.entities.Partner.insert({ id });
                if (!partner.user) {
                    await this.async(() => partner.checkIsUser());
                }
                if (!partner.user) {
                    // partner is not a user, open document instead
                    this.openDocument({
                        model: 'res.partner',
                        id: partner.id,
                    });
                    return;
                }
                const chat = partner.directPartnerThread;
                if (!chat) {
                    this.env.entities.Thread.createChannel({
                        autoselect: true,
                        partnerId: id,
                        type: 'chat',
                    });
                    return;
                }
                chat.open();
            } else {
                this.openDocument({
                    model: 'res.partner',
                    id,
                });
            }
        }

        /**
         * Start messaging and related entities.
         */
        async start() {
            this.update({
                initializer: [['create']],
                notificationHandler: [['create']],
            });
            this._handleGlobalWindowFocus = this._handleGlobalWindowFocus.bind(this);
            this.env.call('bus_service', 'on', 'window_focus', null, this._handleGlobalWindowFocus);
            await this.async(() => this.initializer.start());
            this.notificationHandler.start();
            this.update({ isInitialized: true });
        }

        /**
         * Stop messaging and related entities.
         */
        stop() {
            this.env.call('bus_service', 'off', 'window_focus', null, this._handleGlobalWindowFocus);
            this.initializer.stop();
            this.notificationHandler.stop();
        }

        //----------------------------------------------------------------------
        // Private
        //----------------------------------------------------------------------

        /**
         * @private
         */
        _handleGlobalWindowFocus() {
            this.update({ outOfFocusUnreadMessageCounter: 0 });
            this.env.trigger_up('set_title_part', {
                part: '_chat',
            });
        }

    }

    Messaging.entityName = 'Messaging';

    Messaging.fields = {
        attachmentViewer: one2one('AttachmentViewer', {
            isCausal: true,
        }),
        cannedResponses: attr({
            default: {},
        }),
        chatWindowManager: one2one('ChatWindowManager', {
            inverse: 'messaging',
            isCausal: true,
        }),
        commands: attr({
            default: {},
        }),
        currentPartner: one2one('Partner'),
        currentUser: one2one('User'),
        device: one2one('Device', {
            isCausal: true,
        }),
        dialogManager: one2one('DialogManager', {
            isCausal: true,
        }),
        discuss: one2one('Discuss', {
            isCausal: true,
        }),
        initializer: one2one('MessagingInitializer', {
            inverse: 'messaging',
            isCausal: true,
        }),
        isInitialized: attr({
            default: false,
        }),
        locale: one2one('Locale', {
            isCausal: true,
        }),
        messagingMenu: one2one('MessagingMenu', {
            isCausal: true,
        }),
        notificationHandler: one2one('MessagingNotificationHandler', {
            isCausal: true,
        }),
        outOfFocusUnreadMessageCounter: attr({
            default: 0,
        }),
        partnerRoot: one2one('Partner'),
    };

    return Messaging;
}

registerNewEntity('Messaging', MessagingFactory);

});
