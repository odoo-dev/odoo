odoo.define('mail_bot.components.MessagingMenuTests', function (require) {
"use strict";

const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    getServices,
    pause,
    start: utilsStart,
} = require('mail.messagingTestUtils');

const MailBotService = require('mail_bot.MailBotService');

const { makeTestPromise } = require('web.test_utils');

QUnit.module('mail_bot', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('MessagingMenu', {
    beforeEach: function () {
        utilsBeforeEach(this);
        this.start = async params => {
            const services = Object.assign({}, getServices(), {
                mailbot_service: MailBotService,
            });

            if (this.widget) {
                this.widget.destroy();
            }
            let { discussWidget, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
                hasMessagingMenu: true,
                services,
            }));
            this.discussWidget = discussWidget;
            this.widget = widget;
        };
    },
    afterEach: function () {
        utilsAfterEach(this);
        if (this.widget) {
            this.widget.destroy();
        }
    }
});

QUnit.test('mail_bot: MessagingMenu: rendering with OdooBot has a request (default)', async function (assert) {
    assert.expect(4);

    window.Notification.permission = 'default';

    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'channel_fetch_preview') {
                return [];
            }
            return this._super(...arguments);
        },
    });

    const messagingMenu = document.querySelector('.o_MessagingMenu');
    const counter = messagingMenu.querySelector('.o_MessagingMenu_counter');
    assert.ok(counter,
        "should display a notification counter next to the messaging menu"
    );
    assert.strictEqual(counter.textContent, '1',
        "should display a counter of '1' next to the messaging menu"
    );

    messagingMenu.querySelector('.o_MessagingMenu_toggler').click();
    await afterNextRender();
    assert.containsOnce(messagingMenu, '.o_NotificationRequest',
        "should display a notification in the messaging menu"
    );
    assert.strictEqual(messagingMenu.querySelector('.o_NotificationRequest_name').textContent.trim(),
        'OdooBot has a request',
        "notification should display that OdooBot has a request"
    );
});

QUnit.test('mail_bot: MessagingMenu: rendering without OdooBot has a request (denied)', async function (assert) {
    assert.expect(2);

    window.Notification.permission = 'denied';

    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'channel_fetch_preview') {
                return [];
            }
            return this._super(...arguments);
        },
    });

    const messagingMenu = document.querySelector('.o_MessagingMenu');

    assert.containsNone(messagingMenu, '.o_MessagingMenu_counter',
        "should not display a notification counter next to the messaging menu"
    );

    messagingMenu.querySelector('.o_MessagingMenu_toggler').click();
    await afterNextRender();
    assert.containsNone(messagingMenu, '.o_NotificationRequest',
        "should display no notification in the messaging menu"
    );
});

QUnit.test('mail_bot: MessagingMenu: rendering without OdooBot has a request (accepted)', async function (assert) {
    assert.expect(2);

    window.Notification.permission = 'granted';

    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'channel_fetch_preview') {
                return [];
            }
            return this._super(...arguments);
        },
    });

    const messagingMenu = document.querySelector('.o_MessagingMenu');

    assert.containsNone(messagingMenu, '.o_MessagingMenu_counter',
        "should not display a notification counter next to the messaging menu"
    );

    messagingMenu.querySelector('.o_MessagingMenu_toggler').click();
    await afterNextRender();
    assert.containsNone(messagingMenu, '.o_NotificationRequest',
        "should display no notification in the messaging menu"
    );
});

QUnit.test('mail_bot: MessagingMenu: respond to notification prompt (denied)', async function (assert) {
    assert.expect(3);

    window.Notification.permission = 'default';
    window.Notification.requestPermission = () => {
        window.Notification.permission = 'denied';
        return makeTestPromise().resolve(window.Notification.permission);
    };

    await this.start({
        async mockRPC(route, args) {
            if (args.method === 'channel_fetch_preview') {
                return [];
            }
            return this._super(...arguments);
        },
    });

    const messagingMenu = document.querySelector('.o_MessagingMenu');

    messagingMenu.querySelector('.o_MessagingMenu_toggler').click();
    await afterNextRender();

    messagingMenu.querySelector('.o_NotificationRequest').click();
    await afterNextRender();

    assert.containsOnce(document.body, '.toast .o_notification_content',
        "should display a toast notification with the deny confirmation"
    );
    assert.containsNone(messagingMenu, '.o_MessagingMenu_counter',
        "should not display a notification counter next to the messaging menu"
    );

    messagingMenu.querySelector('.o_MessagingMenu_toggler').click();
    await afterNextRender();

    assert.containsNone(messagingMenu, '.o_NotificationRequest',
        "should display no notification in the messaging menu"
    );
});

});
});
});
