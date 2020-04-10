odoo.define('mail.messaging.component.MessageTests', function (require) {
'use strict';

const components = {
    Message: require('mail.messaging.component.Message'),
};
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.messaging.testUtils');

QUnit.module('mail', {}, function () {
QUnit.module('messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Message', {
    beforeEach() {
        utilsBeforeEach(this);

        this.createMessageComponent = async (message, otherProps) => {
            const MessageComponent = components.Message;
            MessageComponent.env = this.env;
            this.component = new MessageComponent(null, Object.assign({
                messageLocalId: message.localId,
            }, otherProps));
            await this.component.mount(this.widget.el);
            await afterNextRender();
        };

        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { env, widget } = await utilsStart(Object.assign({}, params, {
                data: this.data,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.component) {
            this.component.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.env = undefined;
        delete components.Message.env;
    },
});

QUnit.test('basic rendering', async function (assert) {
    assert.expect(12);

    await this.start();
    const message = this.env.entities.Message.create({
        author: [['insert', { id: 7, display_name: "Demo User" }]],
        body: "<p>Test</p>",
        id: 100,
    });
    await this.createMessageComponent(message);
    assert.strictEqual(
        document.querySelectorAll('.o_Message').length,
        1,
        "should display a message component"
    );
    const messageEl = document.querySelector('.o_Message');
    assert.strictEqual(
        messageEl.dataset.messageLocalId,
        this.env.entities.Message.find(message => message.id === 100).localId,
        "message component should be linked to message store model"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_sidebar`).length,
        1,
        "message should have a sidebar"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_sidebar .o_Message_authorAvatar`).length,
        1,
        "message should have author avatar in the sidebar"
    );
    assert.strictEqual(
        messageEl.querySelector(`:scope .o_Message_authorAvatar`).tagName,
        'IMG',
        "message author avatar should be an image"
    );
    assert.strictEqual(
        messageEl.querySelector(`:scope .o_Message_authorAvatar`).dataset.src,
        '/web/image/res.partner/7/image_128',
        "message author avatar should GET image of the related partner"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_authorName`).length,
        1,
        "message should display author name"
    );
    assert.strictEqual(
        messageEl.querySelector(`:scope .o_Message_authorName`).textContent,
        "Demo User",
        "message should display correct author name"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_date`).length,
        1,
        "message should display date"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_commands`).length,
        1,
        "message should display list of commands"
    );
    assert.strictEqual(
        messageEl.querySelectorAll(`:scope .o_Message_content`).length,
        1,
        "message should display the content"
    );
    assert.strictEqual(messageEl.querySelector(`:scope .o_Message_content`).innerHTML,
        "<p>Test</p>",
        "message should display the correct content"
    );
});

QUnit.test('delete attachment linked to message', async function (assert) {
    assert.expect(1);

    await this.start();
    const message = this.env.entities.Message.create({
        attachments: [['insert-and-replace', {
            filename: "BLAH.jpg",
            id: 10,
            name: "BLAH",
        }]],
        author: [['insert', { id: 7, display_name: "Demo User" }]],
        body: "<p>Test</p>",
        id: 100,
    });
    await this.createMessageComponent(message);
    document.querySelector('.o_Attachment_asideItemUnlink').click();
    await afterNextRender();
    assert.notOk(this.env.entities.Attachment.find(attachment => attachment.id === 10));
});

QUnit.test('moderation: moderated channel with pending moderation message (author)', async function (assert) {
    assert.expect(1);

    await this.start();
    const thread = this.env.entities.Thread.create({
        id: 20,
        model: 'mail.channel',
    });
    const message = this.env.entities.Message.create({
        author: [['insert', { id: 1, display_name: "Admin" }]],
        body: "<p>Test</p>",
        id: 100,
        moderation_status: 'pending_moderation',
        originThread: [['link', thread]],
        threadCaches: [['link', thread.mainCache]],
    });
    await this.createMessageComponent(message);

    assert.strictEqual(
        document.querySelectorAll(`.o_Message_moderationPending.o-author`).length,
        1,
        "should have the message pending moderation"
    );
});

QUnit.test('moderation: moderated channel with pending moderation message (moderator)', async function (assert) {
    assert.expect(9);

    Object.assign(this.data.initMessaging, {
        moderation_channel_ids: [20],
    });
    await this.start();
    const thread = this.env.entities.Thread.create({
        id: 20,
        model: 'mail.channel',
    });
    const message = this.env.entities.Message.create({
        author: [['insert', { id: 7, display_name: "Demo User" }]],
        body: "<p>Test</p>",
        id: 100,
        moderation_status: 'pending_moderation',
        originThread: [['link', thread]],
        threadCaches: [['link', thread.mainCache]],
    });
    await this.createMessageComponent(message);
    const messageEl = document.querySelector('.o_Message');
    assert.ok(messageEl, "should display a message");
    assert.containsOnce(messageEl, `.o_Message_moderationSubHeader`,
        "should have the message pending moderation"
    );
    assert.containsNone(messageEl, `.o_Message_checkbox`,
        "should not have the moderation checkbox by default"
    );
    assert.containsN(messageEl, '.o_Message_moderationAction', 5,
        "there should be 5 contextual moderation decisions next to the message"
    );
    assert.containsOnce(messageEl, '.o_Message_moderationAction.o-accept',
        "there should be a contextual moderation decision to accept the message"
    );
    assert.containsOnce(messageEl, '.o_Message_moderationAction.o-reject',
        "there should be a contextual moderation decision to reject the message"
    );
    assert.containsOnce(messageEl, '.o_Message_moderationAction.o-discard',
        "there should be a contextual moderation decision to discard the message"
    );
    assert.containsOnce(messageEl, '.o_Message_moderationAction.o-allow',
        "there should be a contextual moderation decision to allow the user of the message)"
    );
    assert.containsOnce(messageEl, '.o_Message_moderationAction.o-ban',
        "there should be a contextual moderation decision to ban the user of the message"
    );
    // The actions are tested as part of discuss tests.
});

QUnit.test('Notification Sent', async function (assert) {
    assert.expect(9);

    await this.start();
    const message = this.env.entities.Message.create({
        id: 10,
        message_type: 'email',
        notifications: [['insert', {
            id: 11,
            notification_status: 'sent',
            notification_type: 'email',
            partner: [['insert', { id: 12, name: "Someone" }]],
        }]],
    });
    await this.createMessageComponent(message);

    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a message component"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_notificationIconContainer',
        "should display the notification icon container"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_notificationIcon',
        "should display the notification icon"
    );
    assert.hasClass(
        document.querySelector('.o_Message_notificationIcon'),
        'fa-envelope-o',
        "icon should represent email success"
    );

    await afterNextRender(() => {
        document.querySelector('.o_Message_notificationIconContainer').click();
    });
    assert.containsOnce(
        document.body,
        '.o_NotificationPopover',
        "notification popover should be open"
    );
    assert.containsOnce(
        document.body,
        '.o_NotificationPopover_notificationIcon',
        "popover should have one icon"
    );
    assert.hasClass(
        document.querySelector('.o_NotificationPopover_notificationIcon'),
        'fa-check',
        "popover should have the sent icon"
    );
    assert.containsOnce(
        document.body,
        '.o_NotificationPopover_notificationPartnerName',
        "popover should have the partner name"
    );
    assert.strictEqual(
        document.querySelector('.o_NotificationPopover_notificationPartnerName').textContent.trim(),
        "Someone",
        "partner name should be correct"
    );
});

QUnit.test('Notification Error', async function (assert) {
    assert.expect(8);

    await this.start({
        intercepts: {
            do_action(ev) {
                assert.step('do_action');
                assert.strictEqual(
                    ev.data.action,
                    'mail.mail_resend_message_action',
                    "action should be the one to resend email"
                );
                assert.strictEqual(
                    ev.data.options.additional_context.mail_message_to_resend,
                    10,
                    "action should have correct message id"
                );
            },
        },
    });
    const message = this.env.entities.Message.create({
        id: 10,
        message_type: 'email',
        notifications: [['insert', {
            id: 11,
            notification_status: 'exception',
            notification_type: 'email',
        }]],
    });
    await this.createMessageComponent(message);

    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a message component"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_notificationIconContainer',
        "should display the notification icon container"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_notificationIcon',
        "should display the notification icon"
    );
    assert.hasClass(
        document.querySelector('.o_Message_notificationIcon'),
        'fa-envelope',
        "icon should represent email error"
    );

    await afterNextRender(() => {
        document.querySelector('.o_Message_notificationIconContainer').click();
    });
    assert.verifySteps(
        ['do_action'],
        "should do an action to display the resend email dialog"
    );
});

});
});
});

});
