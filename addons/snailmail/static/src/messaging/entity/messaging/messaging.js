odoo.define('snailmail.messaging.entity.messaging', function (require) {
'use strict';

const {
    registerInstancePatchEntity,
    registerFieldPatchEntity,
} = require('mail.messaging.entityCore');
const { attr } = require('mail.messaging.EntityField');

registerInstancePatchEntity('Messaging', 'snailmail.messaging.entity.messaging', {
    async fetchSnailmailCreditsUrl() {
        const snailmail_credits_url = await this.async(() => this.env.rpc({
            model: 'iap.account',
            method: 'get_credits_url',
            args: ['snailmail'],
        }));
        this.update({
            snailmail_credits_url,
        });
    },
    async fetchSnailmailCreditsUrlTrial() {
        const snailmail_credits_url_trial = await this.async(() => this.env.rpc({
            model: 'iap.account',
            method: 'get_credits_url',
            args: ['snailmail', '', 0, true],
        }));
        this.update({
            snailmail_credits_url_trial,
        });
    },
});

registerFieldPatchEntity('Messaging', 'snailmail.messaging.entity.messaging', {
    snailmail_credits_url: attr(),
    snailmail_credits_url_trial: attr(),
});

});
