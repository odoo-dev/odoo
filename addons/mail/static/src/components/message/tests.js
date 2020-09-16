/** @odoo-module alias=mail.components.Message.tests **/

import makeDeferred from 'mail.utils.makeDeferred';
import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import Bus from 'web.Bus';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('Message', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('basic rendering', async function (assert) {
    assert.expect(12);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: 7,
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    const messageEl = document.querySelector('.o-Message');
    assert.strictEqual(
        messageEl.dataset.messageLocalId,
        env.services.action.dispatch('Message/findById', { $$$id: 100 }).localId,
        "message component should be linked to message store model",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-sidebar',
        "message should have a sidebar",
    );
    assert.containsOnce(
        messageEl,
        `
            .o-Message-sidebar
            .o-Message-authorAvatar
        `,
        "message should have author avatar in the sidebar",
    );
    assert.strictEqual(
        messageEl.querySelector(':scope .o-Message-authorAvatar').tagName,
        'IMG',
        "message author avatar should be an image",
    );
    assert.strictEqual(
        messageEl.querySelector(':scope .o-Message-authorAvatar').dataset.src,
        '/web/image/res.partner/7/image_128',
        "message author avatar should GET image of the related partner",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-authorName',
        "message should display author name",
    );
    assert.strictEqual(
        messageEl.querySelector(':scope .o-Message-authorName').textContent,
        "Demo User",
        "message should display correct author name",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-date',
        "message should display date",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-commands',
        "message should display list of commands",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-content',
        "message should display the content",
    );
    assert.strictEqual(
        messageEl.querySelector(':scope .o-Message-prettyBody').innerHTML,
        "<p>Test</p>",
        "message should display the correct content",
    );
});

QUnit.test('moderation: as author, moderated channel with pending moderation message', async function (assert) {
    assert.expect(1);

    this.data['mail.channel'].records.push(
        { id: 20 },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Admin",
            $$$id: 1,
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$moderationStatus: 'pending_moderation',
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-moderationPending.o-author',
        "should have the message pending moderation",
    );
});

QUnit.test('moderation: as moderator, moderated channel with pending moderation message', async function (assert) {
    assert.expect(9);

    this.data['mail.channel'].records.push(
        {
            id: 20,
            is_moderator: true,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 20,
        $$$model: 'mail.channel',
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Demo User",
            $$$id: 7,
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$moderationStatus: 'pending_moderation',
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    const messageEl = document.querySelector('.o-Message');
    assert.ok(
        messageEl,
        "should display a message",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationSubHeader',
        "should have the message pending moderation",
    );
    assert.containsNone(
        messageEl,
        '.o-Message-checkbox',
        "should not have the moderation checkbox by default",
    );
    assert.containsN(
        messageEl,
        '.o-Message-moderationAction',
        5,
        "there should be 5 contextual moderation decisions next to the message",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationAction.o-accept',
        "there should be a contextual moderation decision to accept the message",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationAction.o-reject',
        "there should be a contextual moderation decision to reject the message",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationAction.o-discard',
        "there should be a contextual moderation decision to discard the message",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationAction.o-allow',
        "there should be a contextual moderation decision to allow the user of the message)",
    );
    assert.containsOnce(
        messageEl,
        '.o-Message-moderationAction.o-ban',
        "there should be a contextual moderation decision to ban the user of the message",
    );
    // The actions are tested as part of discuss tests.
});

QUnit.test('Notification Sent', async function (assert) {
    assert.expect(9);

    this.data['mail.channel'].records.push(
        { id: 11 },
    );
    createServer(this.data);
    const env = await createEnv();
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 10,
        $$$notifications: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 11,
            $$$partner: env.services.action.dispatch('RecordFieldCommand/insert', {
                $$$id: 12,
                $$$name: "Someone",
            }),
            $$$status: 'sent',
            $$$type: 'email',
        }),
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link',
            threadViewer.$$$thread(),
        ),
        $$$type: 'email',
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIconClickable',
        "should display the notification icon container",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIcon',
        "should display the notification icon",
    );
    assert.hasClass(
        document.querySelector('.o-Message-notificationIcon'),
        'fa-envelope-o',
        "icon should represent email success",
    );

    await afterNextRender(
        () => document.querySelector('.o-Message-notificationIconClickable').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover',
        "notification popover should be open",
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover-notificationIcon',
        "popover should have one icon",
    );
    assert.hasClass(
        document.querySelector('.o-NotificationPopover-notificationIcon'),
        'fa-check',
        "popover should have the sent icon",
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationPopover-notificationPartnerName',
        "popover should have the partner name",
    );
    assert.strictEqual(
        document.querySelector('.o-NotificationPopover-notificationPartnerName').textContent.trim(),
        "Someone",
        "partner name should be correct",
    );
});

QUnit.test('Notification Error', async function (assert) {
    assert.expect(8);

    const openResendActionDef = makeDeferred();
    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.step('do_action');
        assert.strictEqual(
            payload.action,
            'mail.mail_resend_message_action',
            "action should be the one to resend email",
        );
        assert.strictEqual(
            payload.options.additional_context.mail_message_to_resend,
            10,
            "action should have correct message id",
        );
        openResendActionDef.resolve();
    });
    this.data['mail.channel'].records.push(
        { id: 11 },
    );
    createServer(this.data);
    const env = await createEnv(
        { env: { bus },
    });
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 10,
        $$$notifications: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 11,
            $$$status: 'exception',
            $$$type: 'email',
        }),
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link',
            threadViewer.$$$thread(),
        ),
        $$$type: 'email',
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIconClickable',
        "should display the notification icon container",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-notificationIcon',
        "should display the notification icon",
    );
    assert.hasClass(
        document.querySelector('.o-Message-notificationIcon'),
        'fa-envelope',
        "icon should represent email error",
    );

    document.querySelector('.o-Message-notificationIconClickable').click();
    await openResendActionDef;
    assert.verifySteps(
        ['do_action'],
        "should do an action to display the resend email dialog",
    );
});

QUnit.test("'channel_fetch' notification received is correctly handled", async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 11,
            members: [this.data.currentPartnerId, 11],
        },
    );
    this.data['res.partner'].records.push(
        {
            display_name: "Recipient",
            id: 11,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const currentPartner = env.services.action.dispatch('Partner/insert', {
        $$$displayName: "Demo User",
        $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
    });
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsNone(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message component should not have any check (V) as message is not yet received",
    );

    // Simulate received channel fetched notification
    const notifications = [
        [
            ['myDB', 'mail.channel', 11],
            {
                info: 'channel_fetched',
                last_message_id: 100,
                partner_id: 11,
            },
        ],
    ];
    await afterNextRender(
        () => this.widget.call('bus_service', 'trigger', 'notification', notifications),
    );
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message seen indicator component should only contain one check (V) as message is just received",
    );
});

QUnit.test("'channel_seen' notification received is correctly handled", async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 11,
            members: [this.data.currentPartnerId, 11],
        },
    );
    this.data['res.partner'].records.push(
        {
            display_name: "Recipient",
            id: 11,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const currentPartner = env.services.action.dispatch('Partner/insert', {
        $$$displayName: "Demo User",
        $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
    });
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsNone(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message component should not have any check (V) as message is not yet received",
    );

    // Simulate received channel seen notification
    const notifications = [
        [
            ['myDB', 'mail.channel', 11],
            {
                info: 'channel_seen',
                last_message_id: 100,
                partner_id: 11,
            },
        ],
    ];
    await afterNextRender(
        () => this.widget.call('bus_service', 'trigger', 'notification', notifications),
    );
    assert.containsN(
        document.body,
        '.o-MessageSeenIndicator-icon',
        2,
        "message seen indicator component should contain two checks (V) as message is seen",
    );
});

QUnit.test("'channel_fetch' notification then 'channel_seen' received  are correctly handled", async function (assert) {
    assert.expect(4);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 11,
            members: [this.data.currentPartnerId, 11],
        },
    );
    this.data['res.partner'].records.push(
        {
            display_name: "Recipient",
            id: 11,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    const currentPartner = env.services.action.dispatch('Partner/insert', {
        $$$displayName: "Demo User",
        $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
    });
    const thread = env.services.action.dispatch('Thread/findById', {
        $$$id: 11,
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsNone(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message component should not have any check (V) as message is not yet received",
    );

    // Simulate received channel fetched notification
    let notifications = [
        [
            ['myDB', 'mail.channel', 11],
            {
                info: 'channel_fetched',
                last_message_id: 100,
                partner_id: 11,
            },
        ],
    ];
    await afterNextRender(
        () => this.widget.call('bus_service', 'trigger', 'notification', notifications)
    );
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message seen indicator component should only contain one check (V) as message is just received",
    );

    // Simulate received channel seen notification
    notifications = [
        [
            ['myDB', 'mail.channel', 11],
            {
                info: 'channel_seen',
                last_message_id: 100,
                partner_id: 11,
            },
        ],
    ];
    await afterNextRender(
        () => this.widget.call('bus_service', 'trigger', 'notification', notifications),
    );
    assert.containsN(
        document.body,
        '.o-MessageSeenIndicator-icon',
        2,
        "message seen indicator component should contain two checks (V) as message is now seen",
    );
});

QUnit.test('do not show messaging seen indicator if not authored by me', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const author = env.services.action.dispatch('Partner/create', {
        $$$displayName: "Demo User",
        $$$id: 100,
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$channelType: 'chat',
        $$$id: 11,
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 11,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: env.services.model.messaging.$$$currentPartner().$$$id(),
            },
            {
                $$$channelId: 11,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: author.$$$id(),
            },
        ]),
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', author),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsNone(
        document.body,
        '.o-Message-seenIndicator',
        "message component should not have any message seen indicator",
    );
});

QUnit.test('do not show messaging seen indicator if before last seen by all message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const currentPartner = env.services.action.dispatch('Partner/insert', {
        $$$displayName: "Demo User",
        $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$channelType: 'chat',
        $$$id: 11,
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 11,
            $$$messageId: 99,
        }),
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const lastSeenMessage = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>You already saw me</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>Test</p>",
        $$$id: 99,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    env.services.action.dispatch('ThreadPartnerSeenInfo/insert', [
        {
            $$$channelId: 11,
            $$$lastSeenMessage: env.services.action.dispatch(
                'RecordFieldCommand/link',
                lastSeenMessage,
            ),
            $$$partnerId: env.services.model.messaging.$$$currentPartner().$$$id(),
        },
        {
            $$$channelId: 11,
            $$$lastSeenMessage: env.services.action.dispatch(
                'RecordFieldCommand/link',
                lastSeenMessage,
            ),
            $$$partnerId: 100,
        }
    ]);
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-seenIndicator',
        "message component should have a message seen indicator",
    );
    assert.containsNone(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message component should not have any check (V)",
    );
});

QUnit.test('only show messaging seen indicator if authored by me, after last seen by all message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    const currentPartner = env.services.action.dispatch('Partner/insert', {
        $$$displayName: "Demo User",
        $$$id: env.services.model.messaging.$$$currentPartner().$$$id(),
    });
    const thread = env.services.action.dispatch('Thread/create', {
        $$$channelType: 'chat',
        $$$id: 11,
        $$$partnerSeenInfos: env.services.action.dispatch('RecordFieldCommand/create', [
            {
                $$$channelId: 11,
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$partnerId: env.services.model.messaging.$$$currentPartner().$$$id(),
            },
            {
                $$$channelId: 11,
                $$$lastFetchedMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 100,
                }),
                $$$lastSeenMessage: env.services.action.dispatch('RecordFieldCommand/insert', {
                    $$$id: 99,
                }),
                $$$partnerId: 100,
            },
        ]),
        $$$messageSeenIndicators: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$channelId: 11,
            $$$messageId: 100,
        }),
        $$$model: 'mail.channel',
    });
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    const message = env.services.action.dispatch('Message/insert', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', currentPartner),
        $$$body: "<p>Test</p>",
        $$$id: 100,
        $$$originThread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "should display a message component",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-seenIndicator',
        "message component should have a message seen indicator",
    );
    assert.containsOnce(
        document.body,
        '.o-MessageSeenIndicator-icon',
        "message component should have one check (V) because the message was fetched by everyone but no other member than author has seen the message",
    );
});

QUnit.test('allow attachment delete on authored message', async function (assert) {
    assert.expect(5);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$attachments: env.services.action.dispatch('RecordFieldCommand/insertAndReplace', {
            $$$filename: "BLAH.jpg",
            $$$id: 10,
            $$$name: "BLAH",
        }),
        $$$author: env.services.action.dispatch(
            'RecordFieldCommand/link',
            env.services.model.messaging.$$$currentPartner(),
        ),
        $$$body: "<p>Test</p>",
        $$$id: 100,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Attachment',
        "should have an attachment",
    );
    assert.containsOnce(
        document.body,
        '.o-Attachment-asideItemUnlink',
        "should have delete attachment button",
    );

    await afterNextRender(
        () => document.querySelector('.o-Attachment-asideItemUnlink').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-AttachmentDeleteConfirmDialog',
        "An attachment delete confirmation dialog should have been opened",
    );
    assert.strictEqual(
        document.querySelector('.o-AttachmentDeleteConfirmDialog-mainText').textContent,
        `Do you really want to delete "BLAH"?`,
        "Confirmation dialog should contain the attachment delete confirmation text",
    );

    await afterNextRender(
        () => document.querySelector('.o-AttachmentDeleteConfirmDialog-confirmButton').click(),
    );
    assert.containsNone(
        document.body,
        '.o-Attachment',
        "should no longer have an attachment",
    );
});

QUnit.test('prevent attachment delete on non-authored message', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$attachments: env.services.action.dispatch('RecordFieldCommand/insertAndReplace', {
            $$$filename: "BLAH.jpg",
            $$$id: 10,
            $$$name: "BLAH",
        }),
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$displayName: "Guy",
            $$$id: 11,
        }),
        $$$body: "<p>Test</p>",
        $$$id: 100,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Attachment',
        "should have an attachment",
    );
    assert.containsNone(
        document.body,
        '.o-Attachment-asideItemUnlink',
        "delete attachment button should not be printed",
    );
});

QUnit.test('subtype description should be displayed if it is different than body', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$body: "<p>Hello</p>",
        $$$id: 100,
        $$$subtypeDescription: "Bonjour",
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-content',
        "message should have content",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-content').textContent,
        "HelloBonjour",
        "message content should display both body and subtype description when they are different",
    );
});

QUnit.test('subtype description should not be displayed if it is similar to body', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$body: "<p>Hello</p>",
        $$$id: 100,
        $$$subtypeDescription: "hello",
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-content',
        "message should have content",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-content').textContent,
        "Hello",
        "message content should display only body when subtype description is similar",
    );
});

QUnit.test('data-oe-id & data-oe-model link redirection on click', async function (assert) {
    assert.expect(7);

    const bus = new Bus();
    bus.on('do-action', null, payload => {
        assert.strictEqual(
            payload.action.type,
            'ir.actions.act_window',
            "action should open view",
        );
        assert.strictEqual(
            payload.action.res_model,
            'some.model',
            "action should open view on 'some.model' model",
        );
        assert.strictEqual(
            payload.action.res_id,
            250,
            "action should open view on 250",
        );
        assert.step('do-action:openFormView_some.model_250');
    });
    createServer(this.data);
    const env = await createEnv({
        env: { bus },
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$body: `<p><a href="#" data-oe-id="250" data-oe-model="some.model">some.model_250</a></p>`,
        $$$id: 100,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-content',
        "message should have content",
    );
    assert.containsOnce(
        document.body,
        `
            .o-Message-content
            a
        `,
        "message content should have a link",
    );

    document.querySelector(`
        .o-Message-content
        a
    `).click();
    assert.verifySteps(
        ['do-action:openFormView_some.model_250'],
        "should have open form view on related record after click on link",
    );
});

QUnit.test('chat with author should be opened after clicking on his avatar', async function (assert) {
    assert.expect(4);

    this.data['res.partner'].records.push(
        { id: 10 },
    );
    this.data['res.users'].records.push(
        { partner_id: 10 },
    );
    createServer(this.data);
    const env = await createEnv({
        hasChatWindow: true,
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 10,
        }),
        $$$id: 10,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-authorAvatar',
        "message should have the author avatar",
    );
    assert.hasClass(
        document.querySelector('.o-Message-authorAvatar'),
        'o_redirect',
        "author avatar should have the redirect style",
    );

    await afterNextRender(
        () => document.querySelector('.o-Message-authorAvatar').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatWindow-thread',
        "chat window with thread should be opened after clicking on author avatar",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatWindow-thread').dataset.correspondentId,
        message.$$$author().$$$id().toString(),
        "chat with author should be opened after clicking on his avatar",
    );
});

QUnit.test('chat with author should be opened after clicking on his im status icon', async function (assert) {
    assert.expect(4);

    this.data['res.partner'].records.push(
        { id: 10 },
    );
    this.data['res.users'].records.push(
        { partner_id: 10 },
    );
    createServer(this.data);
    const env = await createEnv({
        hasChatWindow: true,
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/insert', {
            $$$id: 10,
            $$$im_status: 'online',
        }),
        $$$id: 10,
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-partnerImStatusIcon',
        "message should have the author im status icon",
    );
    assert.hasClass(
        document.querySelector('.o-Message-partnerImStatusIcon'),
        'o-hasOpenChat',
        "author im status icon should have the open chat style",
    );

    await afterNextRender(
        () => document.querySelector('.o-Message-partnerImStatusIcon').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatWindow-thread',
        "chat window with thread should be opened after clicking on author im status icon",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatWindow-thread').dataset.correspondentId,
        message.$$$author().$$$id().toString(),
        "chat with author should be opened after clicking on his im status icon",
    );
});

QUnit.test('open chat with author on avatar click should be disabled when currently chatting with the author', async function (assert) {
    assert.expect(3);

    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            members: [this.data.currentPartnerId, 10],
            public: 'private',
        },
    );
    this.data['res.partner'].records.push(
        { id: 10 },
    );
    this.data['res.users'].records.push(
        { partner_id: 10 },
    );
    createServer(this.data);
    const env = await createEnv({
        hasChatWindow: true,
    });
    const correspondent = env.services.action.dispatch('Partner/insert', {
        $$$id: 10,
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$author: env.services.action.dispatch('RecordFieldCommand/link', correspondent),
        $$$id: 10,
    });
    const thread = await env.services.action.dispatch('Partner/getChat', correspondent);
    const threadViewer = env.services.action.dispatch('ThreadViewer/create', {
        $$$hasThreadView: true,
        $$$thread: env.services.action.dispatch('RecordFieldCommand/link', thread),
    });
    await env.services.action.dispatch('Component/mount', 'Message', {
        message,
        threadView: threadViewer.$$$threadView(),
    });
    assert.containsOnce(
        document.body,
        '.o-Message-authorAvatar',
        "message should have the author avatar",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-Message-authorAvatar'),
        'o_redirect',
        "author avatar should not have the redirect style",
    );

    document.querySelector('.o-Message-authorAvatar').click();
    await nextAnimationFrame();
    assert.containsNone(
        document.body,
        '.o-ChatWindow',
        "should have no thread opened after clicking on author avatar when currently chatting with the author",
    );
});

QUnit.test('basic rendering of tracking value (float type)', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: "float",
            id: 6,
            new_value: 45.67,
            old_value: 12.3,
        }],
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValue',
        "should display a tracking value",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueFieldName',
        "should display the name of the tracked field",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueFieldName').textContent,
        "Total:",
        "should display the correct tracked field name (Total)",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueOldValue',
        "should display the old value",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueOldValue').textContent,
        "12.30",
        "should display the correct old value (12.30)",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueSeparator',
        "should display the separator",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueNewValue',
        "should display the new value",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueNewValue').textContent,
        "45.67",
        "should display the correct new value (45.67)",
    );
});

QUnit.test('rendering of tracked field of type integer: from non-0 to 0', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'integer',
            id: 6,
            new_value: 0,
            old_value: 1,
        }],
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:10",
        "should display the correct content of tracked field of type integer: from non-0 to 0 (Total: 1 -> 0)",
    );
});

QUnit.test('rendering of tracked field of type integer: from 0 to non-0', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'integer',
            id: 6,
            new_value: 1,
            old_value: 0,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:01",
        "should display the correct content of tracked field of type integer: from 0 to non-0 (Total: 0 -> 1)",
    );
});

QUnit.test('rendering of tracked field of type float: from non-0 to 0', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'float',
            id: 6,
            new_value: 0,
            old_value: 1,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:1.000.00",
        "should display the correct content of tracked field of type float: from non-0 to 0 (Total: 1.00 -> 0.00)",
    );
});

QUnit.test('rendering of tracked field of type float: from 0 to non-0', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'float',
            id: 6,
            new_value: 1,
            old_value: 0,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:0.001.00",
        "should display the correct content of tracked field of type float: from 0 to non-0 (Total: 0.00 -> 1.00)",
    );
});

QUnit.test('rendering of tracked field of type monetary: from non-0 to 0', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'monetary',
            id: 6,
            new_value: 0,
            old_value: 1,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:1.000.00",
        "should display the correct content of tracked field of type monetary: from non-0 to 0 (Total: 1.00 -> 0.00)",
    );
});

QUnit.test('rendering of tracked field of type monetary: from 0 to non-0', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Total",
            field_type: 'monetary',
            id: 6,
            new_value: 1,
            old_value: 0,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Total:0.001.00",
        "should display the correct content of tracked field of type monetary: from 0 to non-0 (Total: 0.00 -> 1.00)",
    );
});


QUnit.test('rendering of tracked field of type boolean: from true to false', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Is Ready",
            field_type: 'boolean',
            id: 6,
            new_value: false,
            old_value: true,
        }],
    });
    await env.services.action.dispatch('Component/mount', 'Message', { message });
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Is Ready:TrueFalse",
        "should display the correct content of tracked field of type boolean: from true to false (Is Ready: true -> false)",
    );
});

QUnit.test('rendering of tracked field of type boolean: from false to true', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Is Ready",
            field_type: 'boolean',
            id: 6,
            new_value: true,
            old_value: false,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Is Ready:FalseTrue",
        "should display the correct content of tracked field of type boolean: from false to true (Is Ready: false -> true)",
    );
});

QUnit.test('rendering of tracked field of type char: from a string to empty string', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Name",
            field_type: 'char',
            id: 6,
            new_value: "",
            old_value: "Marc",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Name:Marc",
        "should display the correct content of tracked field of type char: from a string to empty string (Name: Marc ->)",
    );
});

QUnit.test('rendering of tracked field of type char: from empty string to a string', async function (assert) {
    assert.expect(1);

    createServer(this.data);
    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: 'Name',
            field_type: "char",
            id: 6,
            new_value: "Marc",
            old_value: "",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Name:Marc",
        "should display the correct content of tracked field of type char: from a empty to string (Name: -> Marc)",
    );
});

QUnit.test('basic rendering of tracking value (monetary type)', async function (assert) {
    assert.expect(8);

    createServer(this.data);
    const env = await createEnv({
        env: {
            session: {
                currencies: { 1: { symbol: '$', position: 'before' } },
            },
        },
    });
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Revenue",
            currency_id: 1,
            field_type: "monetary",
            id: 6,
            new_value: 500,
            old_value: 1000,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValue',
        "should display a tracking value",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueFieldName',
        "should display the name of the tracked field",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueFieldName').textContent,
        "Revenue:",
        "should display the correct tracked field name (Revenue)",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueOldValue',
        "should display the old value",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueOldValue').innerHTML,
        "$ 1000.00",
        "should display the correct old value with the currency symbol ($ 1000.00)",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueSeparator',
        "should display the separator",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-trackingValueNewValue',
        "should display the new value",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValueNewValue').innerHTML,
        "$ 500.00",
        "should display the correct new value with the currency symbol ($ 500.00)",
    );
});

QUnit.test('rendering of tracked field of type date: from no date to a set date', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Deadline",
            field_type: 'date',
            id: 6,
            new_value: "2018-12-14",
            old_value: false,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Deadline:12/14/2018",
        "should display the correct content of tracked field of type date: from no date to a set date (Deadline: -> 12/14/2018)",
    );
});

QUnit.test('rendering of tracked field of type date: from a set date to no date', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Deadline",
            field_type: 'date',
            id: 6,
            new_value: false,
            old_value: "2018-12-14",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Deadline:12/14/2018",
        "should display the correct content of tracked field of type date: from a set date to no date (Deadline: 12/14/2018 ->)",
    );
});

QUnit.test('rendering of tracked field of type datetime: from no date and time to a set date and time', async function (assert) {
    assert.expect(1);

    const env = await this.start();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Deadline",
            field_type: 'datetime',
            id: 6,
            new_value: "2018-12-14 13:42:28",
            old_value: false,
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Deadline:12/14/2018 13:42:28",
        "should display the correct content of tracked field of type datetime: from no date and time to a set date and time (Deadline: -> 12/14/2018 13:42:28)",
    );
});

QUnit.test('rendering of tracked field of type datetime: from a set date and time to no date and time', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Deadline",
            field_type: 'datetime',
            id: 6,
            new_value: false,
            old_value: "2018-12-14 13:42:28",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Deadline:12/14/2018 13:42:28",
        "should display the correct content of tracked field of type datetime: from a set date and time to no date and time (Deadline: 12/14/2018 13:42:28 ->)",
    );
});

QUnit.test('rendering of tracked field of type text: from some text to empty', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Name",
            field_type: 'text',
            id: 6,
            new_value: "",
            old_value: "Marc",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Name:Marc",
        "should display the correct content of tracked field of type text: from some text to empty (Name: Marc ->)",
    );
});

QUnit.test('rendering of tracked field of type text: from empty to some text', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Name",
            field_type: 'text',
            id: 6,
            new_value: "Marc",
            old_value: "",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Name:Marc",
        "should display the correct content of tracked field of type text: from empty to some text (Name: -> Marc)",
    );
});

QUnit.test('rendering of tracked field of type selection: from a selection to no selection', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "State",
            field_type: 'selection',
            id: 6,
            new_value: "",
            old_value: "ok",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "State:ok",
        "should display the correct content of tracked field of type selection: from a selection to no selection (State: ok ->)",
    );
});

QUnit.test('rendering of tracked field of type selection: from no selection to a selection', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "State",
            field_type: 'selection',
            id: 6,
            new_value: "ok",
            old_value: "",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "State:ok",
        "should display the correct content of tracked field of type selection: from no selection to a selection (State: -> ok)",
    );
});

QUnit.test('rendering of tracked field of type many2one: from having a related record to no related record', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Author",
            field_type: 'many2one',
            id: 6,
            new_value: "",
            old_value: "Marc",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Author:Marc",
        "should display the correct content of tracked field of type many2one: from having a related record to no related record (Author: Marc ->)",
    );
});

QUnit.test('rendering of tracked field of type many2one: from no related record to having a related record', async function (assert) {
    assert.expect(1);

    const env = await createEnv();
    const message = env.services.action.dispatch('Message/create', {
        $$$id: 11,
        $$$trackingValues: [{
            changed_field: "Author",
            field_type: 'many2one',
            id: 6,
            new_value: "Marc",
            old_value: "",
        }],
    });
    await env.services.action.dispatch(
        'Component/mount',
        'Message',
        { message },
    );
    assert.strictEqual(
        document.querySelector('.o-Message-trackingValue').textContent,
        "Author:Marc",
        "should display the correct content of tracked field of type many2one: from no related record to having a related record (Author: -> Marc)",
    );
});


});
});
});
