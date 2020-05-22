odoo.define('snailmail.messaging.entity.NotificationGroup', function (require) {
'use strict';

const {
    registerInstancePatchEntity,
} = require('mail.messaging.entityCore');

registerInstancePatchEntity('NotificationGroup', 'snailmail.messaging.entity.NotificationGroup', {

    //--------------------------------------------------------------------------
    // Public
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    openCancelAction() {
        if (this.notification_type === 'snail') {
            this.env.do_action('snailmail.snailmail_letter_cancel_action', {
                additional_context: {
                    default_model: this.res_model,
                    unread_counter: this.notifications.length,
                }
            });
        }
        return this._super(...arguments);
    },

    //--------------------------------------------------------------------------
    // Private
    //--------------------------------------------------------------------------

    /**
     * @override
     */
    _openDocuments() {
        if (this.notification_type === 'snail') {
            this.env.do_action({
                name: this.env._t("Snailmail Failures"),
                type: 'ir.actions.act_window',
                view_mode: 'kanban,list,form',
                views: [[false, 'kanban'], [false, 'list'], [false, 'form']],
                target: 'current',
                res_model: this.res_model,
                domain: [['message_ids.snailmail_error', '=', true]],
            });
        }
        return this._super(...arguments);
    },
});

});
