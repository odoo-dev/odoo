odoo.define('mail_bot.messaging.widget.NotificationAlertTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start,
} = require('mail.messaging.testUtils');

const FormView = require('web.FormView');

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

    const { widget } = await start({
        data: this.data,
        hasView: true,
        // View params
        View: FormView,
        model: 'mail.message',
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>`,
    });
    await afterNextRender();
    assert.containsOnce(document.body, '.o_notification_alert', "Blocked notification alert should be displayed");

    window.Notification.permission = 'granted';
    widget.reload();
    await afterNextRender();
    assert.containsNone(document.body, '.o_notification_alert', "Blocked notification alert should not be displayed");

    widget.destroy();
});

});
});
});

});
