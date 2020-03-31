odoo.define('mail_bot.messaging.widget.NotificationAlertTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    getServices,
    patchMessagingService,
    pause,
} = require('mail.messaging.testUtils');

const FormView = require('web.FormView');
const { createView } = require('web.test_utils');

QUnit.module('mail_bot', {}, function () {
QUnit.module('messaging', {}, function () {
QUnit.module('widget', {}, function () {
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

    const services = getServices();
    const { unpatch: unpatchMessagingService } = patchMessagingService(services.messaging, {
        withMailbotHasRequestDefaultPatch: false,
    });

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
    await afterNextRender();
    assert.containsOnce(form, '.o_notification_alert', "Blocked notification alert should be displayed");

    window.Notification.permission = 'granted';
    await form.reload();
    afterNextRender();
    assert.containsNone(form, '.o_notification_alert', "Blocked notification alert should not be displayed");

    unpatchMessagingService();
    form.destroy();
});

});
});
});

});
