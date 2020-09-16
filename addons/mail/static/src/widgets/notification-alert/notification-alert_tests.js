/** @odoo-module alias=mail.widgets.NotificationAlert.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import FormView from 'web.FormView';
import { createView } from 'web.test_utils';

QUnit.module('mail', {}, function () {
QUnit.module('widgets', {}, function () {
QUnit.module('NotificationAlert', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.skip('notification_alert widget: display blocked notification alert', async function (assert) {
    // FIXME: Test should work, but for some reasons OWL always flags the
    // component as not mounted, even though it is in the DOM and it's state
    // is good for rendering... task-227947
    assert.expect(1);

    createServer(this.data);
    const env = createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'denied',
                },
            },
        },
    });
    const view = await createView({
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>
        `,
        env,
        model: 'mail.message',
        View: FormView,
    });
    assert.containsOnce(
        document.body,
        '.o-NotificationAlert-text',
        "Blocked notification alert should be displayed",
    );

    view.destroy();
});

QUnit.test('notification_alert widget: no notification alert when granted', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'granted',
                },
            },
        },
    });
    const view = await createView({
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>
        `,
        env,
        model: 'mail.message',
        View: FormView,
    });
    assert.containsNone(
        document.body,
        '.o-NotificationAlert-text',
        "Blocked notification alert should not be displayed",
    );

    view.destroy();
});

QUnit.test('notification_alert widget: no notification alert when default', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'default',
                },
            },
        },
    });
    const view = await createView({
        arch: `
            <form>
                <widget name="notification_alert"/>
            </form>
        `,
        env,
        model: 'mail.message',
        View: FormView,
    });
    assert.containsNone(
        document.body,
        '.o-NotificationAlert-text',
        "Blocked notification alert should not be displayed",
    );

    view.destroy();
});

});
});
});
