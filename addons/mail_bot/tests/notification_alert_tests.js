odoo.define('mail.NotificationAlertTests', function (require) {
'use strict';

const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
} = require('mail.messagingTestUtils');

const FormView = require('web.FormView');
const { createView } = require('web.test_utils');

QUnit.module('mail', {}, function () {
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

    const form = await createView({
        View: FormView,
        model: 'mail.message',
        data: this.data,
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>`,
    });
    assert.containsOnce(form, '.o_notification_alert', "Blocked notification alert should be displayed");

    window.Notification.permission = 'granted';
    await form.reload();
    assert.containsNone(form, '.o_notification_alert', "Blocked notification alert should not be displayed");

    form.destroy();
});

});
});
