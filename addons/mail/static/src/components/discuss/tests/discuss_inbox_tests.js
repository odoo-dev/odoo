/** @odoo-module **/

import {
    afterEach,
    afterNextRender,
    beforeEach,
    nextAnimationFrame,
    start,
} from '@mail/utils/test_utils';

import Bus from 'web.Bus';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('discuss', {}, function () {
QUnit.module('discuss_inbox_tests.js', {
    beforeEach() {
        beforeEach(this);

        this.start = async params => {
            const { env, widget } = await start(Object.assign({}, params, {
                autoOpenDiscuss: true,
                data: this.data,
                hasDiscuss: true,
            }));
            this.env = env;
            this.widget = widget;
        };
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.skipNXOWL('reply: discard on pressing escape', async function (assert) {
    assert.expect(9);

    // partner expected to be found by mention
    this.data['res.partner'].records.push({
        email: "testpartnert@odoo.com",
        id: 11,
        name: "TestPartner",
    });
    // message expected to be found in inbox
    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());
    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "should have composer after clicking on reply to message"
    );

    await afterNextRender(() =>
        document.querySelector(`.o_Composer_buttonEmojis`).click()
    );
    assert.containsOnce(
        document.body,
        '.o_EmojiList',
        "emoji list should be opened after click on emojis button"
    );

    await afterNextRender(() => {
        const ev = new window.KeyboardEvent('keydown', { bubbles: true, key: "Escape" });
        document.querySelector(`.o_Composer_buttonEmojis`).dispatchEvent(ev);
    });
    assert.containsNone(
        document.body,
        '.o_EmojiList',
        "emoji list should be closed after pressing escape on emojis button"
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "reply composer should still be opened after pressing escape on emojis button"
    );

    await afterNextRender(() => {
        document.querySelector(`.o_ComposerTextInput_textarea`).focus();
        document.execCommand('insertText', false, "@");
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keydown'));
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keyup'));
        document.execCommand('insertText', false, "T");
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keydown'));
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keyup'));
        document.execCommand('insertText', false, "e");
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keydown'));
        document.querySelector(`.o_ComposerTextInput_textarea`)
            .dispatchEvent(new window.KeyboardEvent('keyup'));
    });
    assert.containsOnce(
        document.body,
        '.o_ComposerSuggestion',
        "mention suggestion should be opened after typing @"
    );

    await afterNextRender(() => {
        const ev = new window.KeyboardEvent('keydown', { bubbles: true, key: "Escape" });
        document.querySelector(`.o_ComposerTextInput_textarea`).dispatchEvent(ev);
    });
    assert.containsNone(
        document.body,
        '.o_ComposerSuggestion',
        "mention suggestion should be closed after pressing escape on mention suggestion"
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "reply composer should still be opened after pressing escape on mention suggestion"
    );

    await afterNextRender(() => {
        const ev = new window.KeyboardEvent('keydown', { bubbles: true, key: "Escape" });
        document.querySelector(`.o_ComposerTextInput_textarea`).dispatchEvent(ev);
    });
    assert.containsNone(
        document.body,
        '.o_Composer',
        "reply composer should be closed after pressing escape if there was no other priority escape handler"
    );
});

QUnit.skipNXOWL('reply: discard on discard button click', async function (assert) {
    assert.expect(4);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());

    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "should have composer after clicking on reply to message"
    );
    assert.containsOnce(
        document.body,
        '.o_Composer_buttonDiscard',
        "composer should have a discard button"
    );

    await afterNextRender(() =>
        document.querySelector(`.o_Composer_buttonDiscard`).click()
    );
    assert.containsNone(
        document.body,
        '.o_Composer',
        "reply composer should be closed after clicking on discard"
    );
});

QUnit.skipNXOWL('reply: discard on reply button toggle', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());

    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "should have composer after clicking on reply to message"
    );
    await afterNextRender(() =>
        document.querySelector(`.o_MessageActionList_actionReply`).click()
    );
    assert.containsNone(
        document.body,
        '.o_Composer',
        "reply composer should be closed after clicking on reply button again"
    );
});

QUnit.skipNXOWL('reply: discard on click away', async function (assert) {
    assert.expect(7);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());

    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "should have composer after clicking on reply to message"
    );

    document.querySelector(`.o_ComposerTextInput_textarea`).click();
    await nextAnimationFrame(); // wait just in case, but nothing is supposed to happen
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "reply composer should still be there after clicking inside itself"
    );

    await afterNextRender(() =>
        document.querySelector(`.o_Composer_buttonEmojis`).click()
    );
    assert.containsOnce(
        document.body,
        '.o_EmojiList',
        "emoji list should be opened after clicking on emojis button"
    );

    await afterNextRender(() => {
        document.querySelector(`.o_EmojiList_emoji`).click();
    });
    assert.containsNone(
        document.body,
        '.o_EmojiList',
        "emoji list should be closed after selecting an emoji"
    );
    assert.containsOnce(
        document.body,
        '.o_Composer',
        "reply composer should still be there after selecting an emoji (even though it is technically a click away, it should be considered inside)"
    );

    await afterNextRender(() =>
        document.querySelector(`.o_Message`).click()
    );
    assert.containsNone(
        document.body,
        '.o_Composer',
        "reply composer should be closed after clicking away"
    );
});

QUnit.skipNXOWL('"reply to" composer should log note if message replied to is a note', async function (assert) {
    assert.expect(6);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        is_discussion: false,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        async mockRPC(route, args) {
            if (route === '/mail/message/post') {
                assert.step('/mail/message/post');
                assert.strictEqual(
                    args.post_data.message_type,
                    "comment",
                    "should set message type as 'comment'"
                );
                assert.strictEqual(
                    args.post_data.subtype_xmlid,
                    "mail.mt_note",
                    "should set subtype_xmlid as 'note'"
                );
            }
            return this._super(...arguments);
        },
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());

    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.strictEqual(
        document.querySelector('.o_Composer_buttonSend').textContent.trim(),
        "Log",
        "Send button text should be 'Log'"
    );

    await afterNextRender(() =>
        document.execCommand('insertText', false, "Test")
    );
    await afterNextRender(() =>
        document.querySelector('.o_Composer_buttonSend').click()
    );
    assert.verifySteps(['/mail/message/post']);
});

QUnit.skipNXOWL('"reply to" composer should send message if message replied to is not a note', async function (assert) {
    assert.expect(6);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        is_discussion: true,
        model: 'res.partner',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        async mockRPC(route, args) {
            if (route === '/mail/message/post') {
                assert.step('/mail/message/post');
                assert.strictEqual(
                    args.post_data.message_type,
                    "comment",
                    "should set message type as 'comment'"
                );
                assert.strictEqual(
                    args.post_data.subtype_xmlid,
                    "mail.mt_comment",
                    "should set subtype_xmlid as 'comment'"
                );
            }
            return this._super(...arguments);
        },
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    await afterNextRender(() => document.querySelector('.o_Message').click());

    await afterNextRender(() =>
        document.querySelector('.o_MessageActionList_actionReply').click()
    );
    assert.strictEqual(
        document.querySelector('.o_Composer_buttonSend').textContent.trim(),
        "Send",
        "Send button text should be 'Send'"
    );

    await afterNextRender(() =>
        document.execCommand('insertText', false, "Test")
    );
    await afterNextRender(() =>
        document.querySelector('.o_Composer_buttonSend').click()
    );
    assert.verifySteps(['/mail/message/post']);
});

QUnit.skipNXOWL('error notifications should not be shown in Inbox', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        res_id: 20,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100, // id of related message
        notification_status: 'exception',
        notification_type: 'email',
        res_partner_id: this.data.currentPartnerId, // must be for current partner
    });
    await this.start();
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_originThreadLink',
        "should display origin thread link"
    );
    assert.containsNone(
        document.body,
        '.o_Message_notificationIcon',
        "should not display any notification icon in Inbox"
    );
});

QUnit.skipNXOWL('show subject of message in Inbox', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel', // random existing model
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId], // not needed, for consistency
        subject: "Salutations, voyageur", // will be asserted in the test
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_subject',
        "should display subject of the message"
    );
    assert.strictEqual(
        document.querySelector('.o_Message_subject').textContent,
        "Subject: Salutations, voyageur",
        "Subject of the message should be 'Salutations, voyageur'"
    );
});

QUnit.skipNXOWL('show subject of message in history', async function (assert) {
    assert.expect(3);

    this.data['mail.message'].records.push({
        body: "not empty",
        history_partner_ids: [3], // not needed, for consistency
        id: 100,
        model: 'mail.channel', // random existing model
        subject: "Salutations, voyageur", // will be asserted in the test
    });
    this.data['mail.notification'].records.push({
        is_read: true,
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        discuss: {
            params: {
                default_active_id: 'mail.box_history',
            },
        },
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until history displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'history'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_subject',
        "should display subject of the message"
    );
    assert.strictEqual(
        document.querySelector('.o_Message_subject').textContent,
        "Subject: Salutations, voyageur",
        "Subject of the message should be 'Salutations, voyageur'"
    );
});

QUnit.skipNXOWL('click on (non-channel/non-partner) origin thread link should redirect to form view', async function (assert) {
    assert.expect(9);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        // Callback of doing an action (action manager).
        // Expected to be called on click on origin thread link,
        // which redirects to form view of record related to origin thread
        assert.step('do-action');
        assert.strictEqual(
            payload.action.type,
            'ir.actions.act_window',
            "action should open a view"
        );
        assert.deepEqual(
            payload.action.views,
            [[false, 'form']],
            "action should open form view"
        );
        assert.strictEqual(
            payload.action.res_model,
            'some.model',
            "action should open view with model 'some.model' (model of message origin thread)"
        );
        assert.strictEqual(
            payload.action.res_id,
            10,
            "action should open view with id 10 (id of message origin thread)"
        );
    });
    this.data['some.model'] = { fields: {}, records: [{ id: 10 }] };
    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'some.model',
        needaction: true,
        needaction_partner_ids: [this.data.currentPartnerId],
        record_name: "Some record",
        res_id: 10,
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        env: {
            bus,
        },
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message',
        "should display a single message"
    );
    assert.containsOnce(
        document.body,
        '.o_Message_originThreadLink',
        "should display origin thread link"
    );
    assert.strictEqual(
        document.querySelector('.o_Message_originThreadLink').textContent,
        "Some record",
        "origin thread link should display record name"
    );

    document.querySelector('.o_Message_originThreadLink').click();
    assert.verifySteps(['do-action'], "should have made an action on click on origin thread (to open form view)");
});

QUnit.skipNXOWL('subject should not be shown when subject is the same as the thread name', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "subject should not be shown when subject is the same as the thread name"
    );
});

QUnit.skipNXOWL('subject should not be shown when subject is the same as the thread name and both have the same prefix', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Re: Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Re: Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "subject should not be shown when subject is the same as the thread name and both have the same prefix"
    );
});

QUnit.skipNXOWL('subject should not be shown when subject differs from thread name only by the "Re:" prefix', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Re: Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "should not display subject when subject differs from thread name only by the 'Re:' prefix"
    );
});

QUnit.skipNXOWL('subject should not be shown when subject differs from thread name only by the "Fw:" and "Re:" prefix', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Fw: Re: Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "should not display subject when subject differs from thread name only by the 'Fw:' and Re:' prefix"
    );
});

QUnit.skipNXOWL('subject should be shown when the thread name has an extra prefix compared to subject', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Re: Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsOnce(
        document.body,
        '.o_Message_subject',
        "subject should be shown when the thread name has an extra prefix compared to subject"
    );
});

QUnit.skipNXOWL('subject should not be shown when subject differs from thread name only by the "fw:" prefix and both contain another common prefix', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "fw: re: Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Re: Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "subject should not be shown when subject differs from thread name only by the 'fw:' prefix and both contain another common prefix"
    );
});

QUnit.skipNXOWL('subject should not be shown when subject differs from thread name only by the "Re: Re:" prefix', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push({
        body: "not empty",
        id: 100,
        model: 'mail.channel',
        res_id: 100,
        needaction: true,
        subject: "Re: Re: Salutations, voyageur",
    });
    this.data['mail.channel'].records.push({
        id: 100,
        name: "Salutations, voyageur",
    });
    this.data['mail.notification'].records.push({
        mail_message_id: 100,
        notification_status: 'sent',
        notification_type: 'inbox',
        res_partner_id: this.data.currentPartnerId,
    });
    await this.start({
        waitUntilEvent: {
            eventName: 'o-thread-view-hint-processed',
            message: "should wait until inbox displayed its messages",
            predicate: ({ hint, threadViewer }) => {
                return (
                    hint.type === 'messages-loaded' &&
                    threadViewer.thread.model === 'mail.box' &&
                    threadViewer.thread.id === 'inbox'
                );
            },
        },
    });
    assert.containsNone(
        document.body,
        '.o_Message_subject',
        "should not display subject when subject differs from thread name only by the 'Re: Re:'' prefix"
    );
});

});
});
});
