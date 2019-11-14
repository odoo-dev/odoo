odoo.define('mail.FormRendererChatterTests', function (require) {
"use strict";

const {
    afterNextRender,
    pause,
    start,
} = require('mail.messagingTestUtils');

const FormView = require('web.FormView');

QUnit.module('mail.messaging', {}, function () {
QUnit.module('Chatter', {
    beforeEach() {
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
    }
});

QUnit.test('basic chatter rendering', async function (assert) {
    assert.expect(1);
    await this.createView({
        hasView: true,
        async mockRPC(route, args) {
            if (route === '/mail/init_messaging') {
                return {
                    channel_slots: {},
                    commands: [],
                    is_moderator: false,
                    mail_failures: [],
                    mention_partner_suggestions: [],
                    menu_id: false,
                    moderation_counter: 0,
                    moderation_channel_ids: [],
                    needaction_inbox_counter: 0,
                    shortcodes: [],
                    starred_counter: 0,
                };
            }
            return this._super(...arguments);
        },
        // View params
        View: FormView,
        model: 'res.partner',
        data: {
            'res.partner': {
                fields: {
                    display_name: { string: "Displayed name", type: "char" },
                },
                records: [{
                    id: 2,
                    display_name: "second partner",
                }]
            }
        },
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

QUnit.test('chatter updating', async function (assert) {
    assert.expect(7);

    let callCount = 0;
    await this.createView({
        hasView: true,
        async mockRPC(route, args) {
            if (route === '/mail/init_messaging') {
                return {
                    channel_slots: {},
                    commands: [],
                    is_moderator: false,
                    mail_failures: [],
                    mention_partner_suggestions: [],
                    menu_id: false,
                    moderation_counter: 0,
                    moderation_channel_ids: [],
                    needaction_inbox_counter: 0,
                    shortcodes: [],
                    starred_counter: 0,
                };
            } else if (route === '/web/dataset/call_kw/mail.message/message_fetch') {
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
        data: {
            'ir.attachment': {
                fields: {
                    name: { type: 'char', string: "attachment name", required: true },
                    res_model: { type: 'char', string: "res model" },
                    res_id: { type: 'integer', string: "res id" },
                    url: { type: 'char', string: 'url' },
                    type: { type: 'selection', selection: [['url', "URL"], ['binary', "BINARY"]] },
                    mimetype: { type: 'char', string: "mimetype" },
                },
                records: [
                    {
                        id: 1, type: 'url', mimetype: 'image/png', name: 'filename.jpg',
                        res_id: 7, res_model: 'partner'
                    },
                    {
                        id: 2, type: 'binary', mimetype: "application/x-msdos-program",
                        name: "file2.txt", res_id: 7, res_model: 'partner'
                    },
                    {
                        id: 3, type: 'binary', mimetype: "application/x-msdos-program",
                        name: "file3.txt", res_id: 5, res_model: 'partner'
                    },
                ],
            },
            'mail.message': {
                fields: {
                    attachment_ids: {
                        string: "Attachments",
                        type: 'many2many',
                        relation: 'ir.attachment',
                        default: [],
                    },
                    author_id: {
                        string: "Author",
                        relation: 'res.partner',
                    },
                    body: {
                        string: "Contents",
                        type: 'html',
                    },
                    date: {
                        string: "Date",
                        type: 'datetime',
                    },
                    is_note: {
                        string: "Note",
                        type: 'boolean',
                    },
                    is_discussion: {
                        string: "Discussion",
                        type: 'boolean',
                    },
                    is_notification: {
                        string: "Notification",
                        type: 'boolean',
                    },
                    is_starred: {
                        string: "Starred",
                        type: 'boolean',
                    },
                    model: {
                        string: "Related Document Model",
                        type: 'char',
                    },
                    res_id: {
                        string: "Related Document ID",
                        type: 'integer',
                    }
                },
                records: [],
            },
            'res.partner': {
                fields: {
                    display_name: { string: "Displayed name", type: "char" },
                },
                records: [{
                    id: 1,
                    display_name: "first partner",
                }, {
                    id: 2,
                    display_name: "second partner",
                }]
            }
        },
        res_id: 1,
        viewOptions: {
            ids: [1, 2],
            index: 0
        },
        arch: `<form string="Partners">
            <sheet>
                <field name="name"/>
            </sheet>
            <div class="oe_chatter"></div>
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
