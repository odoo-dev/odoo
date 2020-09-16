/** @odoo-module alias=mail.widgets.FormRenderer.tests **/

import makeDeferred from 'mail.utils.makeDeferred';
import afterEach from 'mail.utils.test.afterEach';
import afterNextRender from 'mail.utils.test.afterNextRender';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';
import nextAnimationFrame from 'mail.utils.test.nextAnimationFrame';

import config from 'web.config';
import FormView from 'web.FormView';
import { createView } from 'web.test_utils';
import { triggerEvent } from 'web.test_utils_dom';

QUnit.module('mail', {}, function () {
QUnit.module('widgets', {}, function () {
QUnit.module('FormRenderer', {}, function () {
QUnit.module('tests', {
    beforeEach() {
        beforeEach(this);
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.skip('[technical] spinner when messaging is not created', async function (assert) {
    /**
     * Creation of messaging in env is async due to generation of models being
     * async. Generation of models is async because it requires parsing of all
     * JS modules that contain pieces of model definitions.
     *
     * Time of having no messaging is very short, almost imperceptible by user
     * on UI, but the display should not crash during this critical time period.
     */
    assert.expect(3);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = createEnv({
        async beforeGenerateModels() {
            await new Promise(() => {}); // block messaging creation
        },
        waitUntilMessagingCondition: 'none',
    });
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter"></div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer',
        "should display chatter container even when messaging is not created yet",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should not display any chatter when messaging not created",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterContainer').textContent,
        "Please wait...",
        "chatter container should display spinner when messaging not yet created",
    );
});

QUnit.skip('[technical] keep spinner on transition from messaging non-created to messaging created (and non-initialized)', async function (assert) {
    /**
     * Creation of messaging in env is async due to generation of models being
     * async. Generation of models is async because it requires parsing of all
     * JS modules that contain pieces of model definitions.
     *
     * Time of having no messaging is very short, almost imperceptible by user
     * on UI, but the display should not crash during this critical time period.
     */
    assert.expect(4);

    const def = makeDeferred();
    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async beforeGenerateModels() {
            await def;
        },
        async mockRPC(route, args) {
            const _super = this._super.bind(this, ...arguments); // limitation of class.js
            if (route === '/mail/init_messaging') {
                await new Promise(() => {}); // simulate messaging never initialized
            }
            return _super();
        },
        waitUntilMessagingCondition: 'none',
    });
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter"></div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterContainer').textContent,
        "Please wait...",
        "chatter container should display spinner when messaging not yet created",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should not display any chatter when messaging not created",
    );

    // simulate messaging become created
    def.resolve();
    await nextAnimationFrame();
    assert.strictEqual(
        document.querySelector('.o-ChatterContainer').textContent,
        "Please wait...",
        "chatter container should still display spinner when messaging is created but not initialized",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should still not display any chatter when messaging not initialized",
    );
});

QUnit.skip('spinner when messaging is created but not initialized', async function (assert) {
    assert.expect(3);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            const _super = this._super.bind(this, ...arguments); // limitation of class.js
            if (route === '/mail/init_messaging') {
                await new Promise(() => {}); // simulate messaging never initialized
            }
            return _super();
        },
        waitUntilMessagingCondition: 'created',
    });
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter"></div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer',
        "should display chatter container even when messaging is not fully initialized",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should not display any chatter when messaging not initialized",
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterContainer').textContent,
        "Please wait...",
        "chatter container should display spinner when messaging not yet initialized",
    );
});

QUnit.skip('transition non-initialized messaging to initialized messaging: display spinner then chatter', async function (assert) {
    assert.expect(3);

    const messagingBeforeInitializationDeferred = makeDeferred();
    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            const _super = this._super.bind(this, ...arguments); // limitation of class.js
            if (route === '/mail/init_messaging') {
                await messagingBeforeInitializationDeferred;
            }
            return _super();
        },
        waitUntilMessagingCondition: 'created',
    });
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter"></div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterContainer').textContent,
        "Please wait...",
        "chatter container should display spinner when messaging not yet initialized",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should not display any chatter when messaging not initialized",
    );

    // Simulate messaging becomes initialized
    await afterNextRender(() => messagingBeforeInitializationDeferred.resolve());
    assert.containsNone(
        document.body,
        '.o-ChatterContainer-noChatter',
        "chatter container should now display chatter when messaging becomes initialized",
    );
});

QUnit.skip('basic chatter rendering', async function (assert) {
    assert.expect(1);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter"></div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
});

QUnit.skip('basic chatter rendering without followers', async function (assert) {
    assert.expect(6);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="activity_ids"/>
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "there should be a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "there should be an attachment button",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonScheduleActivity',
        "there should be a schedule activity button",
    );
    assert.containsNone(
        document.body,
        '.o-FollowerListMenu',
        "there should be no followers menu",
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-thread',
        "there should be a thread",
    );
});

QUnit.skip('basic chatter rendering without activities', async function (assert) {
    assert.expect(6);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_follower_ids"/>
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "there should be a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "there should be an attachment button",
    );
    assert.containsNone(
        document.body,
        '.o-ChatterTopbar-buttonScheduleActivity',
        "there should be a schedule activity button",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "there should be a followers menu",
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter-thread',
        "there should be a thread",
    );
});

QUnit.skip('basic chatter rendering without messages', async function (assert) {
    assert.expect(6);

    this.data['res.partner'].records.push(
        {
            display_name: "second partner",
            id: 12,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_follower_ids"/>
                        <field name="activity_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar',
        "there should be a chatter topbar",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonAttachments',
        "there should be an attachment button",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonScheduleActivity',
        "there should be a schedule activity button",
    );
    assert.containsOnce(
        document.body,
        '.o-FollowerListMenu',
        "there should be a followers menu",
    );
    assert.containsNone(
        document.body,
        '.o-Chatter-thread',
        "there should be a thread",
    );
});

QUnit.test('chatter updating', async function (assert) {
    assert.expect(1);

    this.data['mail.message'].records.push(
        {
            body: "not empty",
            model: 'res.partner',
            res_id: 12,
        },
    );
    this.data['res.partner'].records.push(
        { display_name: "first partner", id: 11 },
        { display_name: "second partner", id: 12 },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 11,
            View: FormView,
            viewOptions: {
                ids: [11, 12],
                index: 0,
            },
            waitUntilEvent: {
                eventName: 'o-thread-view-hint-processed',
                message: "should wait until partner 11 thread loaded messages initially",
                predicate: ({ hint, threadViewer }) => {
                    return (
                        hint.type === 'messages-loaded' &&
                        threadViewer.thread.model === 'res.partner' &&
                        threadViewer.thread.id === 11
                    );
                },
            }
        }),
    );
    await this.afterEvent({
        eventName: 'o-thread-view-hint-processed',
        func: () => document.querySelector('.o_pager_next').click(),
        message: "should wait until partner 12 thread loaded messages after clicking on next",
        predicate: ({ hint, threadViewer }) => {
            return (
                hint.type === 'messages-loaded' &&
                threadViewer.thread.model === 'res.partner' &&
                threadViewer.thread.id === 12
            );
        },
    });
    assert.containsOnce(
        document.body,
        '.o-Message',
        "there should be a message in partner 12 thread",
    );
});

QUnit.skip('chatter should become enabled when creation done', async function (assert) {
    assert.expect(10);

    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            View: FormView,
            viewOptions: {
                mode: 'edit',
            },
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonSendMessage',
        "there should be a send message button",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "there should be a log note button",
    );
    assert.containsOnce(
        document.body,
        '.o-ChatterTopbar-buttonLogNote',
        "there should be an attachments button",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage').disabled,
        "send message button should be disabled",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonLogNote').disabled,
        "log note button should be disabled",
    );
    assert.ok(
        document.querySelector('.o-ChatterTopbar-buttonAttachments').disabled,
        "attachments button should be disabled",
    );

    document.querySelectorAll('.o_field_char')[0].focus();
    document.execCommand('insertText', false, "hello");
    await afterNextRender(
        () => document.querySelector('.o_form_button_save').click(),
    );
    assert.notOk(
        document.querySelector('.o-ChatterTopbar-buttonSendMessage').disabled,
        "send message button should now be enabled",
    );
    assert.notOk(
        document.querySelector('.o-ChatterTopbar-buttonLogNote').disabled,
        "log note button should now be enabled",
    );
    assert.notOk(
        document.querySelector('.o-ChatterTopbar-buttonAttachments').disabled,
        "attachments button should now be enabled",
    );
});

QUnit.skip('read more/less links are not duplicated when switching from read to edit mode', async function (assert) {
    assert.expect(5);

    this.data['mail.message'].records.push(
        {
            author_id: 100,
            // "data-o-mail-quote" added by server is intended to be compacted in read more/less blocks
            body: `
                <div>
                    Dear Joel Willis,<br>
                    Thank you for your enquiry.<br>
                    If you have any questions, please let us know.
                    <br><br>
                    Thank you,<br>
                    <span data-o-mail-quote="1">-- <br data-o-mail-quote="1">
                        System
                    </span>
                </div>
            `,
            id: 1000,
            model: 'res.partner',
            res_id: 2,
        }
    );
    this.data['res.partner'].records.push(
        {
            display_name: "Someone",
            id: 100,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 2,
            View: FormView,
            waitUntilEvent: {
                eventName: 'o-component-message-read-more-less-inserted',
                message: "should wait until read more/less is inserted initially",
                predicate: ({ message }) => message.$$$id() === 1000,
            },
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "there should be a message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-readMoreLess',
        "there should be only one read more",
    );

    await afterNextRender(
        () => this.afterEvent({
            eventName: 'o-component-message-read-more-less-inserted',
            func: () => document.querySelector('.o_form_button_edit').click(),
            message: "should wait until read more/less is inserted after clicking on edit",
            predicate: ({ message }) => message.$$$id() === 1000,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Message-readMoreLess',
        "there should still be only one read more after switching to edit mode",
    );

    await afterNextRender(
        () => this.afterEvent({
            eventName: 'o-component-message-read-more-less-inserted',
            func: () => document.querySelector('.o_form_button_cancel').click(),
            message: "should wait until read more/less is inserted after canceling edit",
            predicate: ({ message }) => message.$$$id() === 1000,
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Message-readMoreLess',
        "there should still be only one read more after switching back to read mode",
    );
});

QUnit.skip('read more links becomes read less after being clicked', async function (assert) {
    assert.expect(6);

    this.data['mail.message'].records.push(
        {
            author_id: 100,
            // "data-o-mail-quote" added by server is intended to be compacted in read more/less blocks
            body: `
                <div>
                    Dear Joel Willis,<br>
                    Thank you for your enquiry.<br>
                    If you have any questions, please let us know.
                    <br><br>
                    Thank you,<br>
                    <span data-o-mail-quote="1">-- <br data-o-mail-quote="1">
                        System
                    </span>
                </div>
            `,
            id: 1000,
            model: 'res.partner',
            res_id: 2,
        }
    );
    this.data['res.partner'].records.push(
        {
            display_name: "Someone",
            id: 100,
        },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 2,
            View: FormView,
            waitUntilEvent: {
                eventName: 'o-component-message-read-more-less-inserted',
                message: "should wait until read more/less is inserted initially",
                predicate: ({ message }) => message.$$$id() === 1000,
            },
        }),
    );
    assert.containsOnce(
        document.body,
        '.o-Chatter',
        "there should be a chatter",
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "there should be a message",
    );
    assert.containsOnce(
        document.body,
        '.o-Message-readMoreLess',
        "there should be a read more",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-readMoreLess').textContent,
        'read more',
        "read more/less link should contain 'read more' as text",
    );

    await afterNextRender(
        () => this.afterEvent({
            eventName: 'o-component-message-read-more-less-inserted',
            func: () => document.querySelector('.o_form_button_edit').click(),
            message: "should wait until read more/less is inserted after clicking on edit",
            predicate: ({ message }) => message.$$$id() === 1000,
        }),
    );
    assert.strictEqual(
        document.querySelector('.o-Message-readMoreLess').textContent,
        'read more',
        "read more/less link should contain 'read more' as text",
    );

    document.querySelector('.o-Message-readMoreLess').click();
    assert.strictEqual(
        document.querySelector('.o-Message-readMoreLess').textContent,
        'read less',
        "read more/less link should contain 'read less' as text after it has been clicked",
    );
});

QUnit.skip('Form view not scrolled when switching record', async function (assert) {
    assert.expect(6);

    const messages = [...Array(60).keys()].map(id => {
        return {
            model: 'res.partner',
            res_id: id % 2 ? 11 : 12,
        };
    });
    this.data['mail.message'].records.push(...messages);
    this.data['res.partner'].records.push(
        {
            id: 11,
            display_name: "Partner 1",
            description: [...Array(60).keys()].join('\n'),
        },
        {
            id: 12,
            display_name: "Partner 2",
        },
    );
    createServer(this.data);
    const env = await createEnv({
        config: {
            device: { size_class: config.device.SIZES.LG },
        },
        env: {
            device: { size_class: config.device.SIZES.LG },
        },
    });
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                        <field name="description"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            View: FormView,
            viewOptions: {
                currentId: 11,
                ids: [11, 12],
            },
        }),
    );
    const controllerContentEl = document.querySelector('.o_content');
    assert.strictEqual(
        document.querySelector('.breadcrumb-item.active').textContent,
        'Partner 1',
        "Form view should display partner 'Partner 1'",
    );
    assert.strictEqual(
        controllerContentEl.scrollTop,
        0,
        "The top of the form view is visible",
    );

    await afterNextRender(
        async () => {
            controllerContentEl.scrollTop = controllerContentEl.scrollHeight - controllerContentEl.clientHeight;
            await triggerEvent(
                document.querySelector('.o-ThreadView-messageList'),
                'scroll',
            );
        },
    );
    assert.strictEqual(
        controllerContentEl.scrollTop,
        controllerContentEl.scrollHeight - controllerContentEl.clientHeight,
        "The controller container should be scrolled to its bottom",
    );

    await afterNextRender(
        () => document.querySelector('.o_pager_next').click(),
    );
    assert.strictEqual(
        document.querySelector('.breadcrumb-item.active').textContent,
        'Partner 2',
        "The form view should display partner 'Partner 2'",
    );
    assert.strictEqual(
        controllerContentEl.scrollTop,
        0,
        "The top of the form view should be visible when switching record from pager",
    );

    await afterNextRender(
        () => document.querySelector('.o_pager_previous').click(),
    );
    assert.strictEqual(
        controllerContentEl.scrollTop,
        0,
        "Form view's scroll position should have been reset when switching back to first record",
    );
});

QUnit.skip('Attachments that have been unlinked from server should be visually unlinked from record', async function (assert) {
    // Attachments that have been fetched from a record at certain time and then
    // removed from the server should be reflected on the UI when the current
    // partner accesses this record again.
    assert.expect(2);

    this.data['ir.attachment'].records.push(
        {
           id: 11,
           mimetype: 'text.txt',
           res_id: 11,
           res_model: 'res.partner',
        },
        {
           id: 12,
           mimetype: 'text.txt',
           res_id: 11,
           res_model: 'res.partner',
        },
    );
    this.data['res.partner'].records.push(
        { display_name: "Partner1", id: 11 },
        { display_name: "Partner2", id: 12 },
    );
    createEnv(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form string="Partners">
                    <sheet>
                        <field name="name"/>
                    </sheet>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 11,
            View: FormView,
            viewOptions: {
                ids: [11, 12],
                index: 0,
            },
        }),
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterTopbar-buttonCount').textContent,
        '2',
        "Partner1 should have 2 attachments initially",
    );

    // The attachment links are updated on (re)load,
    // so using pager is a way to reload the record "Partner1".
    await afterNextRender(
        () => document.querySelector('.o_pager_next').click(),
    );
    // Simulate unlinking attachment 12 from Partner 1.
    this.data['ir.attachment'].records.find(a => a.id === 11).res_id = 0;
    await afterNextRender(
        () => document.querySelector('.o_pager_previous').click(),
    );
    assert.strictEqual(
        document.querySelector('.o-ChatterTopbar-buttonCount').textContent,
        '1',
        "Partner1 should now have 1 attachment after it has been unlinked from server",
    );
});

QUnit.test('chatter just contains "creating a new record" message during the creation of a new record after having displayed a chatter for an existing record', async function (assert) {
    assert.expect(2);

    this.data['res.partner'].records.push(
        { id: 12 },
    );
    createServer(this.data);
    const env = await createEnv();
    await afterNextRender(
        () => createView({
            arch: `
                <form>
                    <div class="oe_chatter">
                        <field name="message_ids"/>
                    </div>
                </form>
            `,
            // FIXME archs could be removed once task-2248306 is done
            // The mockServer will try to get the list view
            // of every relational fields present in the main view.
            // In the case of mail fields, we don't really need them,
            // but they still need to be defined.
            archs: {
                'mail.activity,false,list': '<tree/>',
                'mail.followers,false,list': '<tree/>',
                'mail.message,false,list': '<tree/>',
            },
            env,
            model: 'res.partner',
            res_id: 12,
            View: FormView,
        }),
    );
    await afterNextRender(
        () => document.querySelector('.o_form_button_create').click(),
    );
    assert.containsOnce(
        document.body,
        '.o-Message',
        "Should have a single message when creating a new record",
    );
    assert.strictEqual(
        document.querySelector('.o-Message-content').textContent,
        'Creating a new record...',
        "the message content should be in accord to the creation of this record",
    );
});

});
});
});
