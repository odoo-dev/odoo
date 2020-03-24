odoo.define('mail_bot.NotificationAlertTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    getServices,
    patchMessagingService,
    pause,
} = require('mail.messagingTestUtils');

const MailbotService = require('mail_bot.MailBotService');

const FormView = require('web.FormView');
const { createView, mock: { unpatch } } = require('web.test_utils');

QUnit.module('mail_bot', {}, function () {
QUnit.module('NotificationAlert', {
    beforeEach() {
        utilsBeforeEach(this);
    },
    afterEach() {
        utilsAfterEach(this);
    },
});

QUnit.test('notification_alert widget: display blocked notification alert', async function (assert) {
    assert.expect(2);

    window.Notification.permission = 'denied';

    const services = Object.assign({}, getServices(), {
        mail_bot: MailbotService,
    });
    patchMessagingService(services.messaging);

    const form = await createView({
        View: FormView,
        model: 'mail.message',
        data: this.data,
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>`,
        services,
    });
    assert.containsOnce(form, '.o_notification_alert', "Blocked notification alert should be displayed");

    window.Notification.permission = 'granted';
    await form.reload();
    assert.containsNone(form, '.o_notification_alert', "Blocked notification alert should not be displayed");

    unpatch(services.messaging);
    form.destroy();
});

});
});
