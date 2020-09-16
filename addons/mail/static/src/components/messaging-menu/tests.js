/** @odoo-module alias=mail.components.MessagingMenu.tests **/

import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import { makeTestPromise } from 'web.test_utils';

QUnit.module('mail', {}, function () {
QUnit.module('components', {}, function () {
QUnit.module('MessagingMenu', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.skip('[technical] messaging not created then becomes created', async function (assert) {
    /**
     * Creation of messaging in env is async due to generation of models being
     * async. Generation of models is async because it requires parsing of all
     * JS modules that contain pieces of model definitions.
     *
     * Time of having no messaging is very short, almost imperceptible by user
     * on UI, but the display should not crash during this critical time period.
     */
    assert.expect(2);

    const def = makeTestPromise();
    createServer(this.data);
    const env = await createEnv({
        async beforeGenerateModels() {
            await def;
        },
        waitUntilMessagingCondition: 'none',
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu',
        "should have messaging menu even when messaging is not yet created",
    );

    // simulate messaging becoming created
    def.resolve();
    await nextAnimationFrame();
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu',
        "should still contain messaging menu after messaging has been created",
    );
});

QUnit.skip('[technical] no crash on attempting opening messaging menu when messaging not created', async function (assert) {
    /**
     * Creation of messaging in env is async due to generation of models being
     * async. Generation of models is async because it requires parsing of all
     * JS modules that contain pieces of model definitions.
     *
     * Time of having no messaging is very short, almost imperceptible by user
     * on UI, but the display should not crash during this critical time period.
     *
     * Messaging menu is not expected to be open on click because state of
     * messaging menu requires messaging being created.
     */
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv({
        async beforeGenerateModels() {
            await new Promise(() => {}); // keep messaging not created
        },
        waitUntilMessagingCondition: 'none',
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu',
        "should have messaging menu even when messaging is not yet created",
    );

    let error;
    try {
        document.querySelector('.o-MessagingMenu-toggler').click();
        await nextAnimationFrame();
    } catch (err) {
        error = err;
    }
    assert.notOk(
        !!error,
        "Should not crash on attempt to open messaging menu when messaging not created",
    );
    if (error) {
        throw error;
    }
});

QUnit.skip('messaging not initialized', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            if (route === '/mail/init_messaging') {
                // simulate messaging never initialized
                return new Promise(resolve => {});
            }
            return this._super(...arguments);
        },
        waitUntilMessagingCondition: 'created',
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-loading',
        "should display loading icon on messaging menu when messaging not yet initialized",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.strictEqual(
        document.querySelector('.o-MessagingMenu-dropdownMenu').textContent,
        "Please wait...",
        "should prompt loading when opening messaging menu",
    );
});

QUnit.skip('messaging becomes initialized', async function (assert) {
    assert.expect(2);

    const messagingInitialized = makeTestPromise();
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route) {
            const _super = this._super.bind(this, ...arguments); // limitation of class.js
            if (route === '/mail/init_messaging') {
                await messagingInitialized;
            }
            return _super();
        },
        waitUntilMessagingCondition: 'created',
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );

    // simulate messaging becomes initialized
    await afterNextRender(() => messagingInitialized.resolve());
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-loading',
        "should no longer display loading icon on messaging menu when messaging becomes initialized",
    );
    assert.notOk(
        document.querySelector('.o-MessagingMenu-dropdownMenu').textContent.includes("Please wait..."),
        "should no longer prompt loading when opening messaging menu when messaging becomes initialized",
    );
});

QUnit.test('basic rendering', async function (assert) {
    assert.expect(21);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu',
        "should have messaging menu",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu'),
        'show',
        "should not mark messaging menu item as shown by default",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu_toggler',
        "should have clickable element on messaging menu",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-toggler'),
        'show',
        "should not mark messaging menu clickable item as shown by default",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu_icon',
        "should have icon on clickable element in messaging menu",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-icon'),
        'fa-comments',
        "should have 'comments' icon on clickable element in messaging menu",
    );
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-dropdownMenu',
        "should not display any messaging menu dropdown by default",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu'),
        "o-isOpen",
        "should mark messaging menu as opened",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-dropdownMenu',
        "should display messaging menu dropdown after click",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-dropdownMenuHeader',
        "should have dropdown menu header",
    );
    assert.containsN(
        document.body,
        `
            .o-MessagingMenu-dropdownMenuHeader
            .o-MessagingMenu-tabButton
        `,
        3,
        "should have 3 tab buttons to filter items in the header",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="all"]',
        "1 tab button should be 'All'",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="chat"]',
        "1 tab button should be 'Chat'",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="channel"]',
        "1 tab button should be 'Channels'",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "'all' tab button should be active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "'chat' tab button should not be active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab button should not be active",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-newMessageButton',
        "should have button to make a new message",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-NotificationList
        `,
        "should display thread preview list",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-NotificationList-noConversation
        `,
        "should display no conversation in thread preview list",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu'),
        "o-isOpen",
        "should mark messaging menu as closed",
    );
});

QUnit.test('counter is taking into account failure notification', async function (assert) {
    assert.expect(2);

    this.data['mail.channel'].records.push({
        id: 31,
        seen_message_id: 11,
    });
    // message that is expected to have a failure
    this.data['mail.message'].records.push(
        {
            id: 11, // random unique id, will be used to link failure to message
            model: 'mail.channel', // expected value to link message to channel
            res_id: 31, // id of a random channel
        },
    );
    // failure that is expected to be used in the test
    this.data['mail.notification'].records.push(
        {
            mail_message_id: 11, // id of the related message
            notification_status: 'exception', // necessary value to have a failure
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-counter',
        "should display a notification counter next to the messaging menu for one notification",
    );
    assert.strictEqual(
        document.querySelector('.o-MessagingMenu-counter').textContent,
        "1",
        "should display a counter of '1' next to the messaging menu",
    );
});

QUnit.test('switch tab', async function (assert) {
    assert.expect(15);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="all"]',
        "1 tab button should be 'All'",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="chat"]',
        "1 tab button should be 'Chat'",
    );
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-tabButton[data-tab-id="channel"]',
        "1 tab button should be 'Channels'",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "'all' tab button should be active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "'chat' tab button should not be active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab button should not be active",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]').click(),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "'all' tab button should become inactive",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "'chat' tab button should not become active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab button should stay inactive",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]').click(),
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "'all' tab button should stay active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "'chat' tab button should become inactive",
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab button should become active",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]').click(),
    );
    assert.hasClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]'),
        'o-isActive',
        "'all' tab button should become active",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]'),
        'o-isActive',
        "'chat' tab button should stay inactive",
    );
    assert.doesNotHaveClass(
        document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]'),
        'o-isActive',
        "'channel' tab button should become inactive",
    );
});

QUnit.test('new message', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await env.services.action.dispatch('Component/mount', 'ChatWindowManager');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-newMessageButton').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatWindow',
        "should have open a chat window",
    );
    assert.hasClass(
        document.querySelector('.o-ChatWindow'),
        'o-hasNewMessage',
        "chat window should be for new message",
    );
    assert.hasClass(
        document.querySelector('.o-ChatWindow'),
        'o-isFocused',
        "chat window should be focused",
    );
});

QUnit.test('no new message when discuss is open', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await env.services.action.dispatch('Component/mount', 'Discuss');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-newMessageButton',
        "should not have 'new message' when discuss is open",
    );

    // simulate closing discuss app
    await afterNextRender(() => this.discussWidget.on_detach_callback());
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-newMessageButton',
        "should have 'new message' when discuss is closed",
    );

    // simulate opening discuss app
    await afterNextRender(() => this.discussWidget.on_attach_callback());
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-newMessageButton',
        "should not have 'new message' when discuss is open again",
    );
});

QUnit.test('channel preview: basic rendering', async function (assert) {
    assert.expect(9);

    // channel that is expected to be found in the test
    this.data['mail.channel'].records.push(
        {
            id: 20, // random unique id, will be used to link message to channel
            name: "General", // random name, will be asserted in the test
        },
    );
    // message that is expected to be displayed in the test
    this.data['mail.message'].records.push(
        {
            author_id: 7, // not current partner, will be asserted in the test
            body: "<p>test</p>", // random body, will be asserted in the test
            channel_ids: [20], // id of related channel
            model: 'mail.channel', // necessary to link message to channel
            res_id: 20, // id of related channel
        },
    );
    this.data['res.partner'].records.push(
        {
            id: 7, // random unique id, to link message author
            name: "Demo", // random name, will be asserted in the test
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should have one preview",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-sidebar
        `,
        "preview should have a sidebar",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-content
        `,
        "preview should have some content",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-header
        `,
        "preview should have header in content",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-header
            .o-ThreadPreview-name
        `,
        "preview should have name in header of content",
    );
    assert.strictEqual(
        document.querySelector(`
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-name
        `).textContent,
        "General",
        "preview should have name of channel",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-content
            .o-ThreadPreview-core
        `,
        "preview should have core in content",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-core
            .o-ThreadPreview-inlineText
        `,
        "preview should have inline text in core of content",
    );
    assert.strictEqual(
        document.querySelector(`
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview-core
            .o-ThreadPreview-inlineText
        `).textContent.trim(),
        "Demo: test",
        "preview should have message content as inline text of core content",
    );
});

QUnit.test('filtered previews', async function (assert) {
    assert.expect(12);

    // chat and channel expected to be found in the menu
    this.data['mail.channel'].records.push(
        {
            channel_type: 'chat',
            id: 10,
        },
        {
            id: 20,
        },
    );
    this.data['mail.message'].records.push(
        {
            channel_ids: [10], // id of related channel
            model: 'mail.channel', // to link message to channel
            res_id: 10, // id of related channel
        },
        {
            channel_ids: [20], // id of related channel
            model: 'mail.channel', // to link message to channel
            res_id: 20, // id of related channel
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsN(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        2,
        "should have 2 previews",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 10,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of chat",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 20,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of channel",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="chat"]').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should have one preview",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 10,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of chat",
    );
    assert.containsNone(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 20,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should not have preview of channel",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="channel"]').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should have one preview",
    );
    assert.containsNone(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 10,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should not have preview of chat",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 20,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of channel",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-tabButton[data-tab-id="all"]').click(),
    );
    assert.containsN(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        2,
        "should have 2 previews",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 10,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of chat",
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview[data-thread-local-id="${
                env.services.action.dispatch('Thread/findById', {
                    $$$id: 20,
                    $$$model: 'mail.channel',
                }).localId
            }"]
        `,
        "should have preview of channel",
    );
});

QUnit.test('open chat window from preview', async function (assert) {
    assert.expect(1);

    // channel expected to be found in the menu, only its existence matters, data are irrelevant
    this.data['mail.channel'].records.push(
        {},
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await env.services.action.dispatch('Component/mount', 'ChatWindowManager');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    await afterNextRender(
        () => document.querySelector(`
            .o-MessagingMenu_dropdownMenu
            .o-ThreadPreview
        `).click(),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatWindow',
        "should have open a chat window",
    );
});

QUnit.test('no code injection in message body preview', async function (assert) {
    assert.expect(5);

    this.data['mail.channel'].records.push(
        { id: 11 },
    );
    this.data['mail.message'].records.push(
        {
            body: "<p><em>&shoulnotberaised</em><script>throw new Error('CodeInjectionError');</script></p>",
            channel_ids: [11],
        }
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should display a preview",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-core',
        "preview should have core in content",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-inlineText',
        "preview should have inline text in core of content",
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadPreview-inlineText')
            .textContent.replace(/\s/g, ""),
        "You:&shoulnotberaisedthrownewError('CodeInjectionError');",
        "should display correct uninjected last message inline content",
    );
    assert.containsNone(
        document.querySelector('.o-ThreadPreview-inlineText'),
        'script',
        "last message inline content should not have any code injection",
    );
});

QUnit.test('no code injection in message body preview from sanitized message', async function (assert) {
    assert.expect(5);

    this.data['mail.channel'].records.push(
        { id: 11 },
    );
    this.data['mail.message'].records.push(
        {
            body: "<p>&lt;em&gt;&shoulnotberaised&lt;/em&gt;&lt;script&gt;throw new Error('CodeInjectionError');&lt;/script&gt;</p>",
            channel_ids: [11],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should display a preview",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-core',
        "preview should have core in content",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-inlineText',
        "preview should have inline text in core of content",
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadPreview-inlineText')
            .textContent.replace(/\s/g, ""),
        "You:<em>&shoulnotberaised</em><script>thrownewError('CodeInjectionError');</script>",
        "should display correct uninjected last message inline content",
    );
    assert.containsNone(
        document.querySelector('.o-ThreadPreview-inlineText'),
        'script',
        "last message inline content should not have any code injection",
    );
});

QUnit.test('<br/> tags in message body preview are transformed in spaces', async function (assert) {
    assert.expect(4);

    this.data['mail.channel'].records.push(
        { id: 11 },
    );
    this.data['mail.message'].records.push(
        {
            body: "<p>a<br/>b<br>c<br   />d<br     ></p>",
            channel_ids: [11],
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .o-MessagingMenu-dropdownMenu
            .o-ThreadPreview
        `,
        "should display a preview",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-core',
        "preview should have core in content",
    );
    assert.containsOnce(
        document.body,
        '.o-ThreadPreview-inlineText',
        "preview should have inline text in core of content",
    );
    assert.strictEqual(
        document.querySelector('.o-ThreadPreview-inlineText').textContent,
        "You: a b c d",
        "should display correct last message inline content with brs replaced by spaces",
    );
});

QUnit.test('rendering with OdooBot has a request (default)', async function (assert) {
    assert.expect(4);

    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'default',
                },
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsOnce(
        document.body,
        '.o-MessagingMenu-counter',
        "should display a notification counter next to the messaging menu for OdooBot request",
    );
    assert.strictEqual(
        document.querySelector('.o-MessagingMenu-counter').textContent,
        "1",
        "should display a counter of '1' next to the messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-NotificationRequest',
        "should display a notification in the messaging menu",
    );
    assert.strictEqual(
        document.querySelector('.o-NotificationRequest-name').textContent.trim(),
        'OdooBot has a request',
        "notification should display that OdooBot has a request",
    );
});

QUnit.test('rendering without OdooBot has a request (denied)', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'denied',
                },
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-counter',
        "should not display a notification counter next to the messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsNone(
        document.body,
        '.o-NotificationRequest',
        "should display no notification in the messaging menu",
    );
});

QUnit.test('rendering without OdooBot has a request (accepted)', async function (assert) {
    assert.expect(2);

    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'granted',
                },
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-counter',
        "should not display a notification counter next to the messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsNone(
        document.body,
        '.o-NotificationRequest',
        "should display no notification in the messaging menu",
    );
});

QUnit.test('respond to notification prompt (denied)', async function (assert) {
    assert.expect(3);

    createServer(this.data);
    const env = await createEnv({
        env: {
            browser: {
                Notification: {
                    permission: 'default',
                    async requestPermission() {
                        this.permission = 'denied';
                        return this.permission;
                    },
                },
            },
        },
    });
    await env.services.action.dispatch('Component/mount', 'MessagingMenu');
    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    await afterNextRender(
        () => document.querySelector('.o-NotificationRequest').click(),
    );
    assert.containsOnce(
        document.body,
        `
            .toast
            .o_notification_content
        `,
        "should display a toast notification with the deny confirmation",
    );
    assert.containsNone(
        document.body,
        '.o-MessagingMenu-counter',
        "should not display a notification counter next to the messaging menu",
    );

    await afterNextRender(
        () => document.querySelector('.o-MessagingMenu-toggler').click(),
    );
    assert.containsNone(
        document.body,
        '.o-NotificationRequest',
        "should display no notification in the messaging menu",
    );
});

});
});
});
