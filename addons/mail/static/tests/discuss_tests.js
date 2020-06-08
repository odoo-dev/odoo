odoo.define('mail.discuss_test', function (require) {
"use strict";

const Discuss = require('mail.Discuss');
const { getMailServices } = require('mail.messaging.testUtils');
var mailTestUtils = require('mail.testUtils');

var testUtils = require('web.test_utils');

var createDiscuss = mailTestUtils.createDiscuss;
const cpHelpers = testUtils.controlPanel;

QUnit.module('mail', {}, function () {
QUnit.module('Discuss', {
    beforeEach: function () {
        // patch _.debounce and _.throttle to be fast and synchronous
        this.underscoreDebounce = _.debounce;
        this.underscoreThrottle = _.throttle;
        _.debounce = _.identity;
        _.throttle = _.identity;

        this.data = {
            'mail.message': {
                fields: {
                    body: {
                        string: "Contents",
                        type: 'html',
                    },
                    author_id: {
                        string: "Author",
                        relation: 'res.partner',
                    },
                    channel_ids: {
                        string: "Channels",
                        type: 'many2many',
                        relation: 'mail.channel',
                    },
                    needaction: {
                        string: "Need Action",
                        type: 'boolean',
                    },
                    needaction_partner_ids: {
                        string: "Partners with Need Action",
                        type: 'many2many',
                        relation: 'res.partner',
                    },
                    history_partner_ids: {
                        string: "Partners with History",
                        type: 'many2many',
                        relation: 'res.partner',
                    },
                    model: {
                        string: "Related Document model",
                        type: 'char',
                    },
                    res_id: {
                        string: "Related Document ID",
                        type: 'integer',
                    },
                },
                records: [],
            },
            'res.partner': {
                fields: {
                    im_status: {
                        string: "status",
                        type: 'char',
                    },
                },
                records: [{
                    id: 1,
                    im_status: 'online',
                }]
            },
            'mail.notification': {
                fields: {
                    is_read: {
                        string: "Is Read",
                        type: 'boolean',
                    },
                    mail_message_id: {
                        string: "Message",
                        type: 'many2one',
                        relation: 'mail.message',
                    },
                    res_partner_id: {
                        string: "Needaction Recipient",
                        type: 'many2one',
                        relation: 'res.partner',
                    },
                },
            },
        };
        this.services = getMailServices({ hasLegacyMail: true });
    },
    afterEach: function () {
        // unpatch _.debounce and _.throttle
        _.debounce = this.underscoreDebounce;
        _.throttle = this.underscoreThrottle;
    },
});

QUnit.test('basic rendering', async function (assert) {
    assert.expect(5);

    var discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
    });

    // test basic rendering
    var $sidebar = discuss.$('.o_mail_discuss_sidebar');
    assert.strictEqual($sidebar.length, 1,
        "should have rendered a sidebar");

    assert.containsOnce(discuss, '.o_mail_discuss_content',
        "should have rendered the content");
    assert.containsOnce(discuss, '.o_mail_no_content',
        "should display no content message");

    var $inbox = $sidebar.find('.o_mail_discuss_item[data-thread-id=mailbox_inbox]');
    assert.strictEqual($inbox.length, 1,
        "should have the mailbox item 'mailbox_inbox' in the sidebar");

    var $history = $sidebar.find('.o_mail_discuss_item[data-thread-id=mailbox_history]');
    assert.strictEqual($history.length, 1,
        "should have the mailbox item 'mailbox_history' in the sidebar");

    discuss.destroy();
});

QUnit.test('messaging not ready', async function (assert) {
    assert.expect(9);

    const messagingReadyProm = testUtils.makeTestPromise();
    const discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        async mockRPC(route, args) {
            if (route === '/mail/init_messaging') {
                const _super = this._super.bind(this, ...arguments); // limitation of class.js
                assert.step('/mail/init_messaging:pending');
                await messagingReadyProm;
                assert.step('/mail/init_messaging:resolved');
                return _super();
            }
            return this._super(...arguments);
        },
    });

    assert.verifySteps(['/mail/init_messaging:pending']);
    assert.ok(
        discuss.el,
        "discuss should be rendered");
    assert.strictEqual(
        $('.o_action')[0],
        discuss.el,
        "should display discuss even when messaging is not ready");
    assert.containsOnce(
        discuss,
        '.o_mail_discuss_sidebar .o_mail_discuss_loading',
        "should display sidebar is loading (messaging not yet ready)");
    assert.containsOnce(
        discuss,
        '.o_mail_discuss_content .o_mail_discuss_loading',
        "should display content is loading (messaging not yet ready)");

    messagingReadyProm.resolve();
    await testUtils.nextTick();
    assert.verifySteps(['/mail/init_messaging:resolved']);
    assert.containsNone(
        discuss,
        '.o_mail_discuss_loading',
        "should no longer display sidebar or content is loading (messaging is ready)");

    discuss.destroy();
});

QUnit.test('messaging initially ready', async function (assert) {
    assert.expect(7);

    const startDiscussProm = testUtils.makeTestPromise();

    testUtils.mock.patch(Discuss, {
        /**
         * @override
         */
        async start() {
            const _super = this._super.bind(this, ...arguments); // due to limitation of class.js
            assert.step('discuss:starting');
            await startDiscussProm;
            assert.step('discuss:started');
            return _super();
        },
    });

    const discussProm = createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        mockRPC(route) {
            if (route === '/mail/init_messaging') {
                assert.step(route);
            }
            return this._super(...arguments);
        }
    });
    await testUtils.nextTick();
    assert.verifySteps([
        '/mail/init_messaging',
        'discuss:starting',
    ]);

    startDiscussProm.resolve();
    await testUtils.nextTick();
    assert.verifySteps(['discuss:started']);
    const discuss = await discussProm;
    assert.ok(
        discuss.el,
        "discuss should be rendered");
    assert.containsNone(
        discuss,
        '.o_mail_discuss_loading',
        "should not display sidebar or content is loading (messaging is ready)");

    testUtils.mock.unpatch(Discuss);
    discuss.destroy();
});

QUnit.test('searchview options visibility', async function (assert) {
    assert.expect(2);

    var discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
    });

    assert.hasClass(discuss.$('.o_control_panel .o_searchview_icon.fa'), 'fa-search',
        "should have a search icon");
    assert.isVisible(discuss.$('.o_control_panel .o_search_options'),
        "search options should always be visible");

    discuss.destroy();
});

QUnit.test('searchview filter messages', async function (assert) {
    assert.expect(10);

    this.data['mail.message'].records = [{
        author_id: [5, 'Demo User'],
        body: '<p>abc</p>',
        id: 1,
        needaction: true,
        needaction_partner_ids: [3],
    }, {
        author_id: [6, 'Test User'],
        body: '<p>def</p>',
        id: 2,
        needaction: true,
        needaction_partner_ids: [3],
    }];

    var discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        session: {
            partner_id: 3
        },
        archs: {
            'mail.message,false,search':
                '<search>' +
                    '<field name="body"/>' +
                '</search>',
        },
    });
    assert.containsN(discuss, '.o_thread_message', 2,
        "there should be two messages in the inbox mailbox");
    assert.strictEqual($('.o_searchview_input').length, 1,
        "there should be a searchview on discuss");
    assert.strictEqual($('.o_searchview_input').val(), '',
        "the searchview should be empty initially");

    // interact with searchview so that there is only once message
    await cpHelpers.editSearch(discuss, "ab");
    await cpHelpers.validateSearch(discuss);
    assert.strictEqual($('.o_searchview_facet').length, 1,
        "the searchview should have a facet");
    assert.strictEqual($('.o_facet_values').text().trim(), 'ab',
        "the facet should be a search on 'ab'");
    assert.containsOnce(discuss, '.o_thread_message',
        "there should be a single message after filter");

    // interact with search view so that there are no matching messages
    await testUtils.dom.click($('.o_facet_remove'));
    await cpHelpers.editSearch(discuss, "abcd");
    await cpHelpers.validateSearch(discuss);

    assert.strictEqual($('.o_searchview_facet').length, 1,
        "the searchview should have a facet");
    assert.strictEqual($('.o_facet_values').text().trim(), 'abcd',
        "the facet should be a search on 'abcd'");
    assert.containsNone(discuss, '.o_thread_message',
        "there should be no message after 2nd filter");
    assert.strictEqual(discuss.$('.o_thread_title').text().trim(),
        "No matches found",
        "should display that there are no matching messages");

    discuss.destroy();

});

QUnit.test('non-deletable message attachments', async function (assert) {
    assert.expect(2);

    this.data['mail.message'].records = [{
        attachment_ids: [{
            filename: "text.txt",
            id: 250,
            mimetype: 'text/plain',
            name: "text.txt",
        }, {
            filename: "image.png",
            id: 251,
            mimetype: 'image/png',
            name: "image.png",
        }],
        author_id: [5, "Demo User"],
        body: "<p>test</p>",
        id: 1,
        needaction: true,
        needaction_partner_ids: [3],
        model: 'some.document',
        record_name: "SomeDocument",
        res_id: 100,
    }];

    const discuss = await createDiscuss({
        context: {},
        data: this.data,
        params: {},
        services: this.services,
        session: {
            partner_id: 3,
        },
    });
    assert.containsN(
        discuss,
        '.o_attachment',
        2,
        "should display 2 attachments");
    assert.containsNone(
        discuss.$('.o_attachment'),
        'o_attachment_delete_cross',
        "attachments should not be deletable");

    discuss.destroy();
});

QUnit.test('reply to message from inbox', async function (assert) {
    assert.expect(11);

    var self = this;
    this.data['mail.message'].records = [{
        author_id: [5, 'Demo User'],
        body: '<p>test 1</p>',
        id: 1,
        needaction: true,
        needaction_partner_ids: [3],
        res_id: 100,
        model: 'some.document',
        record_name: 'SomeDocument',
    }];
    this.data.initMessaging = {
        needaction_inbox_counter: 1,
    };

    var discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        session: { partner_id: 3 },
        mockRPC: function (route, args) {
            if (args.method === 'message_post') {
                assert.step(args.method);
                assert.strictEqual(args.model, 'some.document',
                    "should post message to correct document model");
                assert.strictEqual(args.args[0], 100,
                    "should post message to correct document ID");

                self.data['mail.message'].records.push({
                    author_id: [3, 'Me'],
                    body: args.kwargs.body,
                    id: 2,
                    res_id: 100,
                    model: 'some.document',
                    record_name: 'SomeDocument',
                });
                return Promise.resolve(2);
            }
            return this._super.apply(this, arguments);
        },
    });
    assert.strictEqual(discuss.$('.o_mail_discuss_item.o_active').data('thread-id'),
        'mailbox_inbox',
        "Inbox should be selected by default");
    assert.containsOnce(discuss, '.o_thread_message',
        "should display a single message in inbox");
    assert.strictEqual(discuss.$('.o_thread_message').data('message-id'), 1,
        "message should be linked to correct message");
    assert.containsOnce(discuss.$('.o_thread_message'), '.o_thread_message_reply',
        "should display the reply icon for message linked to a document");

    await testUtils.dom.click(discuss.$('.o_thread_message_reply'));
    var $composer = discuss.$('.o_thread_composer_extended');
    assert.isVisible($composer,
        "extended composer should become visible");
    assert.strictEqual($composer.find('.o_composer_subject input').val(),
        'Re: SomeDocument',
        "composer should have copied document name as subject of message");

    var $textarea = $composer.find('.o_composer_input textarea').first();
    await testUtils.fields.editInput($textarea, 'someContent');
    assert.containsOnce($composer, '.o_composer_button_send',
        "should have button to send reply message");
    await testUtils.dom.click($composer.find('.o_composer_button_send'));

    assert.verifySteps(['message_post']);

    discuss.destroy();
});

QUnit.test('discard replying to message from inbox', async function (assert) {
    assert.expect(4);

    var self = this;
    this.data['mail.message'].records = [{
        author_id: [5, 'Demo User'],
        body: '<p>test 1</p>',
        id: 1,
        needaction: true,
        needaction_partner_ids: [3],
        res_id: 100,
        model: 'some.document',
        record_name: 'SomeDocument',
    }];
    this.data.initMessaging = {
        needaction_inbox_counter: 1,
    };

    var discuss = await createDiscuss({
        id: 1,
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        session: { partner_id: 3 },
        mockRPC: function (route, args) {
            if (args.method === 'message_post') {
                assert.step(args.method);
                assert.strictEqual(args.model, 'some.document',
                    "should post message to correct document model");
                assert.strictEqual(args.args[0], 100,
                    "should post message to correct document ID");

                self.data['mail.message'].records.push({
                    author_id: [3, 'Me'],
                    body: args.kwargs.body,
                    id: 2,
                    res_id: 100,
                    model: 'some.document',
                    record_name: 'SomeDocument',
                });
                return Promise.resolve(2);
            }
            return this._super.apply(this, arguments);
        },
    });

    await testUtils.dom.click(discuss.$('.o_thread_message_reply'));
    assert.containsOnce(discuss, '.o_thread_selected_message',
        "should have a message selected");

    var $composer = discuss.$('.o_thread_composer_extended');
    assert.containsOnce($composer, '.o_composer_button_discard',
        "should have button to discard replying to message");

    await testUtils.dom.click($composer.find('.o_composer_button_discard'));
    assert.isNotVisible($composer,
        "extended composer should become hidden on discard");
    assert.containsNone(discuss, '.o_thread_selected_message',
        "should not longer have a message selected");

    discuss.destroy();
});

QUnit.test('save filter discuss', async function (assert) {
    assert.expect(3);

    var messageFetchCount = 0;
    const discuss = await createDiscuss({
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        archs: {
            'mail.message,false,search': '<search>' +
                '<field name="body" string="Content" filter_domain="[\'|\', (\'subject\', \'ilike\', self), (\'body\', \'ilike\', self)]"/>' +
            '</search>',
        },
        session: {
            partner_id: 3
        },
        mockRPC: async function (route, args) {
            if (args.method === 'message_fetch' && messageFetchCount === 1) {
                assert.deepEqual(args.args[0], [
                    ["needaction", "=", true],
                    "|",
                    ["subject", "ilike", "she was born in a hurricane"],
                    ["body", "ilike", "she was born in a hurricane"],
                ], 'The fetch domain is correct');
            }
            return this._super.apply(this,arguments);
        },
        env: {
            dataManager: {
                create_filter: async function (filter) {
                    assert.deepEqual(
                        JSON.parse(filter.domain), [
                            "|",
                            ["subject", "ilike", "she was born in a hurricane"],
                            ["body", "ilike", "she was born in a hurricane"]
                        ], 'The filter should have been saved with the right domain');
                }
            }
        }
    });
    assert.containsOnce(discuss, '.o_searchview_input_container', 'search view input present');

    await cpHelpers.editSearch(discuss, "she was born in a hurricane");

    messageFetchCount = 1;

    await cpHelpers.validateSearch(discuss);

    await cpHelpers.toggleFavoriteMenu(discuss);
    await cpHelpers.toggleSaveFavorite(discuss);

    await cpHelpers.editFavoriteName(discuss, "War");
    await cpHelpers.saveFavorite(discuss);

    discuss.destroy();
});

QUnit.test('no crash on receiving needaction channel message notif with messaging not ready', async function (assert) {
    assert.expect(1);

    const message = {
        author_id: [5, 'Demo User'],
        body: '<p>test</p>',
        channel_ids: [1],
        id: 100,
        model: 'mail.channel',
        needaction: true,
        needaction_partner_ids: [3],
        res_id: 1,
    };

    const discuss = await createDiscuss({
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        session: {
            partner_id: 3
        },
        async mockRPC(route, args) {
            if (route === '/mail/init_messaging') {
                // infinite messaging not ready
                await new Promise(() => {});
            }
            return this._super(...arguments);
        },
    });

    // simulate new needaction message posted on channnel
    this.data['mail.message'].records.push(message);
    // simulate receiving channel notification
    discuss.call('bus_service', 'trigger', 'notification', [
        [['myDB', 'mail.channel', 1], message]
    ]);
    // short delay after receiving needaction notification
    await testUtils.nextTick();
    // simulate receiving needaction message notification after a short delay
    discuss.call('bus_service', 'trigger', 'notification', [
        [['myDB', 'ir.needaction', 3], message]
    ]);
    await testUtils.nextTick();
    assert.ok(true, "should not crash on receiving new needaction message when messaging is not ready");

    discuss.destroy();
});

QUnit.test('load record form view', async function (assert) {
    assert.expect(4);
    this.data['mail.message'].records = [{
        author_id: [5, 'Demo User'],
        body: '<a id="test_redirect_link" href="#" data-oe-model="my.model" data-oe-id="10">Link</a>',
        id: 1,
        needaction: true,
        needaction_partner_ids: [3],
        res_id: 100,
        model: 'some.document',
        record_name: 'SomeDocument',
    }];
    const discuss = await createDiscuss({
        context: {},
        params: {},
        data: this.data,
        services: this.services,
        session: {
            partner_id: 3,
            user_context: { uid: 99 },
        },
        async mockRPC(route, args) {
            if (args.model === 'my.model' && args.method === 'get_formview_id') {
                const [resIds, uid] = args.args;
                assert.step('get_redirect_form');
                assert.deepEqual(resIds, [10],
                    "should have have called with the correct ID");
                assert.strictEqual(uid, 99,
                    "should have have called with the current user");
            }
            return this._super(...arguments);
        },
    });
    await testUtils.dom.click(discuss.$('#test_redirect_link'));
    assert.verifySteps(['get_redirect_form']);
    discuss.destroy();
});

});
});
