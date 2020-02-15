odoo.define('mail.component.MessageTests', function (require) {
'use strict';

const Message = require('mail.component.Message');
const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start: utilsStart,
} = require('mail.messagingTestUtils');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Message', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createMessage = async (messageLocalId, otherProps) => {
            Message.env = this.env;
            // messages must be displayed in the context of a thread
            const threadLocalId = this.env.store.dispatch('_createThread', {
                _model: 'mail.channel',
                id: 20,
            });
            this.message = new Message(null, Object.assign({
                messageLocalId,
                threadLocalId,
            }, otherProps));
            await this.message.mount(this.widget.$el[0]);
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
        if (this.message) {
            this.message.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.env = undefined;
        delete Message.env;
    }
});

QUnit.test('default', async function (assert) {
    assert.expect(12);

    await this.start();
    const messageLocalId = this.env.store.dispatch('_createMessage', {
        author_id: [7, "Demo User"],
        body: "<p>Test</p>",
        id: 100,
    });
    await this.createMessage(messageLocalId);
    assert.strictEqual(
        document.querySelectorAll('.o_Message').length,
        1,
        "should display a message component"
    );
    const message = document.querySelector('.o_Message');
    assert.strictEqual(
        message.dataset.messageLocalId,
        'mail.message_100',
        "message component should be linked to message store model"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_sidebar`).length,
        1,
        "message should have a sidebar"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_sidebar .o_Message_authorAvatar`).length,
        1,
        "message should have author avatar in the sidebar"
    );
    assert.strictEqual(
        message.querySelector(`:scope .o_Message_authorAvatar`).tagName,
        'IMG',
        "message author avatar should be an image"
    );
    assert.strictEqual(
        message.querySelector(`:scope .o_Message_authorAvatar`).dataset.src,
        '/web/image/res.partner/7/image_128',
        "message author avatar should GET image of the related partner"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_authorName`).length,
        1,
        "message should display author name"
    );
    assert.strictEqual(
        message.querySelector(`:scope .o_Message_authorName`).textContent,
        "Demo User",
        "message should display correct author name"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_date`).length,
        1,
        "message should display date"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_commands`).length,
        1,
        "message should display list of commands"
    );
    assert.strictEqual(
        message.querySelectorAll(`:scope .o_Message_content`).length,
        1,
        "message should display the content"
    );
    assert.strictEqual(message.querySelector(`:scope .o_Message_content`).innerHTML,
        "<p>Test</p>",
        "message should display the correct content"
    );
});

QUnit.test('deleteAttachment', async function (assert) {
    assert.expect(2);

    await this.start();
    const messageLocalId = this.env.store.dispatch('_createMessage', {
        attachment_ids: [{
            filename: "BLAH.jpg",
            id: 10,
            name: "BLAH",
        }],
        author_id: [7, "Demo User"],
        body: "<p>Test</p>",
        id: 100,
    });
    await this.createMessage(messageLocalId);
    document.querySelector('.o_Attachment_asideItemUnlink').click();
    await afterNextRender();
    assert.ok(!this.env.store.state.attachments['ir.attachment_10']);
    assert.ok(!this.env.store.state.messages[messageLocalId].attachmentLocalIds['ir.attachment_10']);
});

QUnit.test('moderation: moderated channel with pending moderation message (author)', async function (assert) {
    assert.expect(1);
    await this.start();
    const messageLocalId = this.env.store.dispatch('_createMessage', {
        author_id: [1, "Admin"],
        body: "<p>Test</p>",
        id: 100,
        model: 'mail.channel',
        moderation_status: 'pending_moderation',
        res_id: 20,
    });
    await this.createMessage(messageLocalId);

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
    const messageLocalId = this.env.store.dispatch('_createMessage', {
        author_id: [7, "Demo User"],
        body: "<p>Test</p>",
        id: 100,
        model: 'mail.channel',
        moderation_status: 'pending_moderation',
        res_id: 20,
    });
    await this.createMessage(messageLocalId);
    const message = document.querySelector('.o_Message');
    assert.ok(message, "should display a message");
    assert.containsOnce(message, `.o_Message_moderationSubHeader`,
        "should have the message pending moderation"
    );
    assert.containsNone(message, `.o_Message_checkbox`,
        "should not have the moderation checkbox by default"
    );
    const moderationActionSelector = '.o_Message_moderationAction';
    assert.containsN(message, moderationActionSelector, 5,
        "there should be 5 contextual moderation decisions next to the message"
    );
    assert.containsOnce(message, moderationActionSelector + '.o-accept',
        "there should be a contextual moderation decision to accept the message"
    );
    assert.containsOnce(message, moderationActionSelector + '.o-reject',
        "there should be a contextual moderation decision to reject the message"
    );
    assert.containsOnce(message, moderationActionSelector + '.o-discard',
        "there should be a contextual moderation decision to discard the message"
    );
    assert.containsOnce(message, moderationActionSelector + '.o-allow',
        "there should be a contextual moderation decision to allow the user of the message)"
    );
    assert.containsOnce(message, moderationActionSelector + '.o-ban',
        "there should be a contextual moderation decision to ban the user of the message"
    );
    // The actions are tested as part of discuss tests.
});

});
});
});
