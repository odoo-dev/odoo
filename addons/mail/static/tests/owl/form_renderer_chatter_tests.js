odoo.define('mail.FormRendererChatterTests', function (require) {
"use strict";

const {
    afterEach: utilsAfterEach,
    afterNextRender,
    beforeEach: utilsBeforeEach,
    pause,
    start,
} = require('mail.messagingTestUtils');

const FormView = require('web.FormView');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('Chatter', {
    beforeEach() {
        utilsBeforeEach(this);
        this.underscoreDebounce = _.debounce;
        this.underscoreThrottle = _.throttle;
        _.debounce = _.identity;
        _.throttle = _.identity;
        this.createView = async (...args) => {
            const { widget } = await start(...args);
            this.view = widget;
            await afterNextRender();
        };
    },
    afterEach() {
        _.debounce = this.underscoreDebounce;
        _.throttle = this.underscoreThrottle;
        if (this.view) {
            this.view.destroy();
        }
        utilsAfterEach(this);
    }
});

QUnit.test('basic chatter rendering', async function (assert) {
    assert.expect(1);
    this.data['res.partner'].records = [{
        id: 2,
        display_name: "second partner",
    }];
    await this.createView({
        data: this.data,
        hasView: true,
        // View params
        View: FormView,
        model: 'res.partner',
        arch: `<form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter"></div>
            </form>`,
        res_id: 2,
    });

    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "there should be a chatter"
    );
});

QUnit.test('basic chatter rendering without followers', async function (assert) {
    assert.expect(7);
    this.data['res.partner'] = {
        fields: {
            message_attachment_count: {
                string: 'Attachment count',
                type: 'integer'
            },
            activity_ids: {
                string: "Activities",
                type: 'one2many',
                relation: 'mail.activity'
            },
            message_ids: {
                string: "Messages",
                type: 'one2many',
                relation: 'mail.message'
            },
            message_follower_ids: {
                string: "Followers",
                type: 'one2many',
                relation: 'mail.followers'
            },
            name: {string: "Name", type: 'char'},
        },
        records: [{
            activity_ids: [],
            id: 2,
            display_name: "second partner",
            message_ids: [],
            message_follower_ids: [],
        }],
    };
    await this.createView({
        data: this.data,
        hasView: true,
        // View params
        View: FormView,
        model: 'res.partner',
        arch: `<form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter">
                    <field name="activity_ids" widget="mail_activity"/>
                    <field name="message_ids" widget="mail_thread"/>
                </div>
            </form>`,
        res_id: 2,
    });

    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "there should still be a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "there should still be a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachments`).length,
        1,
        "there should still be an attachment button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonScheduleActivity`).length,
        1,
        "there should still be a schedule activity button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollow`).length,
        0,
        "there should be no follow button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollowers`).length,
        0,
        "there should still be no followers button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_thread`).length,
        1,
        "there should still be a thread"
    );
});

QUnit.test('basic chatter rendering without activities', async function (assert) {
    assert.expect(7);
    this.data['res.partner'] = {
        fields: {
            message_attachment_count: {
                string: 'Attachment count',
                type: 'integer'
            },
            activity_ids: {
                string: "Activities",
                type: 'one2many',
                relation: 'mail.activity'
            },
            message_ids: {
                string: "Messages",
                type: 'one2many',
                relation: 'mail.message'
            },
            message_follower_ids: {
                string: "Followers",
                type: 'one2many',
                relation: 'mail.followers'
            },
            name: {string: "Name", type: 'char'},
        },
        records: [{
            activity_ids: [],
            id: 2,
            display_name: "second partner",
            message_ids: [],
            message_follower_ids: [],
        }],
    };
    await this.createView({
        data: this.data,
        hasView: true,
        // View params
        View: FormView,
        model: 'res.partner',
        arch: `<form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter">
                    <field name="message_follower_ids" widget="mail_followers"/>
                    <field name="message_ids" widget="mail_thread"/>
                </div>
            </form>`,
        res_id: 2,
    });

assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "there should still be a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "there should still be a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachments`).length,
        1,
        "there should still be an attachment button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonScheduleActivity`).length,
        0,
        "there should be no schedule activity button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollow`).length,
        1,
        "there should still be a follow button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollowers`).length,
        1,
        "there should still be a followers button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_thread`).length,
        1,
        "there should still be a thread"
    );
});

QUnit.test('basic chatter rendering without messages', async function (assert) {
    assert.expect(7);

    this.data['res.partner'] = {
        fields: {
            message_attachment_count: {
                string: 'Attachment count',
                type: 'integer'
            },
            activity_ids: {
                string: "Activities",
                type: 'one2many',
                relation: 'mail.activity'
            },
            message_ids: {
                string: "Messages",
                type: 'one2many',
                relation: 'mail.message'
            },
            message_follower_ids: {
                string: "Followers",
                type: 'one2many',
                relation: 'mail.followers'
            },
            name: {string: "Name", type: 'char'},
        },
        records: [{
            activity_ids: [],
            id: 2,
            display_name: "second partner",
            message_ids: [],
            message_follower_ids: [],
        }],
    };

    this.data['res.partner'].records = [{
        id: 2,
        display_name: "second partner",
    }];
    await this.createView({
        data: this.data,
        hasView: true,
        // View params
        View: FormView,
        model: 'res.partner',
        arch: `<form string="Partners">
                <sheet>
                    <field name="name"/>
                </sheet>
                <div class="oe_chatter">
                    <field name="message_follower_ids" widget="mail_followers"/>
                    <field name="activity_ids" widget="mail_activity"/>
                </div>
            </form>`,
        res_id: 2,
    });

    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "there should still be a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar`).length,
        1,
        "there should still be a chatter topbar"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonAttachments`).length,
        1,
        "there should still be an attachment button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonScheduleActivity`).length,
        1,
        "there should still be a schedule activity button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollow`).length,
        1,
        "there should still be a follow button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_ChatterTopbar_buttonFollowers`).length,
        1,
        "there should still be a followers button"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter_thread`).length,
        0,
        "there should be no thread"
    );
});

QUnit.test('chatter updating', async function (assert) {
    assert.expect(7);
    this.data['ir.attachment'].records = [{
        id: 1, type: 'url', mimetype: 'image/png', name: 'filename.jpg',
        res_id: 7, res_model: 'partner'
    }, {
        id: 2, type: 'binary', mimetype: "application/x-msdos-program",
        name: "file2.txt", res_id: 7, res_model: 'partner'
    }, {
        id: 3, type: 'binary', mimetype: "application/x-msdos-program",
        name: "file3.txt", res_id: 5, res_model: 'partner'
    }];
    this.data['res.partner'] = {
        fields: {
            message_attachment_count: { string: 'Attachment count', type: 'integer' },
            message_ids: { string: "Messages", type: 'one2many', relation: 'mail.message' },
            name: {string: "Name", type: 'char'},
        },
        records: [{
            id: 1,
            display_name: "first partner",
            message_ids: [],
        }, {
            id: 2,
            display_name: "second partner",
            message_ids: [],
        }],
    };
    let callCount = 0;
    await this.createView({
        data: this.data,
        hasView: true,
        async mockRPC(route, args) {
            if (route === '/web/dataset/call_kw/mail.message/message_fetch') {
                callCount++;
                if (callCount === 1) {
                    assert.step('message_fetch:1');
                    return [];
                } else {
                    assert.step('message_fetch:2');
                    return [{
                        id: 1,
                        body: "<p>test 1</p>",
                        author_id: [100, "Someone"],
                        channel_ids: [1],
                        model: 'mail.channel',
                        res_id: 1,
                        moderation_status: 'accepted',
                    }];
                }
            }
            return this._super(...arguments);
        },
        // View params
        View: FormView,
        model: 'res.partner',
        res_id: 1,
        viewOptions: {
            ids: [1, 2],
            index: 0
        },
        arch: `<form string="Partners">
            <sheet>
                <field name="name"/>
            </sheet>
            <div class="oe_chatter">
                <field name="message_ids" widget="mail_thread"/>
            </div>
        </form>`,
    });
    assert.strictEqual(
        document.querySelectorAll(`.o_Chatter`).length,
        1,
        "there should be a chatter"
    );
    assert.strictEqual(
        document.querySelectorAll(`.o_Message`).length,
        0,
        "there should be no message"
    );
    assert.verifySteps(['message_fetch:1']);

    document.querySelector(`.o_pager_next`).click();
    await afterNextRender();
    assert.strictEqual(
        document.querySelectorAll(`.o_Message`).length,
        1,
        "there should be a message"
    );
    assert.verifySteps(['message_fetch:2']);
});

});
});
