/** @odoo-module alias=mail.legacy.Chatter.tests **/

import afterEach from 'mail.utils.test.afterEach';
import beforeEach from 'mail.utils.test.beforeEach';
import createEnv from 'mail.utils.test.createEnv';
import createServer from 'mail.utils.test.createServer';

import FormView from 'web.FormView';
import { createView, nextTick } from 'web.test_utils';
import { click } from 'web.test_utils_dom';
import { clickM2OHighlightedItem, clickOpenM2ODropdown, editInput } from 'web.test_utils_fields';
import { clickEdit } from 'web.test_utils_form';

QUnit.module('mail', {}, function () {
QUnit.module('legacy', {}, function () {
QUnit.module('Chatter', {}, function () {
QUnit.module('tests', {
    beforeEach: function () {
        beforeEach(this);

        this.data['ir.attachment'].records.push(
            {
                id: 1,
                mimetype: 'image/png',
                name: "filename.jpg",
                res_id: 7,
                res_model: 'res.users',
                type: 'url',
            },
            {
                id: 2,
                mimetype: 'application/x-msdos-program',
                name: "file2.txt",
                res_id: 7,
                res_model: 'res.users',
                type: 'binary',
            },
            {
                id: 3,
                mimetype: 'application/x-msdos-program',
                name: "file3.txt",
                res_id: 5,
                res_model: 'res.users',
                type: 'binary',
            },
        );
        this.data['mail.activity.type'].records.push(
            {
                id: 1,
                name: "Type 1",
            },
            {
                id: 2,
                name: "Type 2",
            },
            {
                category: 'upload_file',
                id: 3,
                name: "Type 3",
            },
            {
                decoration_type: 'warning',
                icon: 'fa-warning',
                id: 4,
                name: "Exception",
            },
        );
        this.data['res.partner'].records.push(
            {
                id: 11,
                im_status: 'online',
            },
        );
        Object.assign(this.data['res.users'].fields, {
            activity_exception_decoration: {
                selection: [['warning', 'Alert'], ['danger', 'Error']],
                string: "Decoration",
                type: 'selection',
            },
            activity_exception_icon: {
                string: "icon",
                type: 'char',
            },
            activity_ids: {
                relation: 'mail.activity',
                relation_field: 'res_id',
                string: "Activities",
                type: 'one2many',
            },
            activity_state: {
                selection: [['overdue', 'Overdue'], ['today', 'Today'], ['planned', 'Planned']],
                string: "State",
                type: 'selection',
            },
            activity_summary: {
                string: "Next Activity Summary",
                type: 'char',
            },
            activity_type_icon: {
                string: "Activity Type Icon",
                type: 'char',
            },
            activity_type_id: {
                string: "Activity type",
                type: 'many2one',
                relation: 'mail.activity.type',
            },
            foo: {
                default: "My little Foo Value",
                string: "Foo",
                type: 'char',
            },
            message_attachment_count: {
                string: "Attachment count",
                type: 'integer',
            },
            message_follower_ids: {
                relation: 'mail.followers',
                relation_field: 'res_id',
                string: "Followers",
                type: 'one2many',
            },
            message_ids: {
                relation: 'mail.message',
                relation_field: 'res_id',
                string: "messages",
                type: 'one2many',
            },
        });
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.module('FieldMany2ManyTagsEmail', {
    beforeEach() {
        beforeEach(this);

        Object.assign(this.data['res.users'].fields, {
            timmy: {
                relation: 'partner_type',
                string: "pokemon",
                type: 'many2many',
            },
        });
        this.data['res.users'].records.push(
            {
                display_name: "first record",
                id: 11,
                timmy: [],
            },
        );
        Object.assign(this.data, {
            partner_type: {
                fields: {
                    email: {
                        string: "Email",
                        type: 'char',
                    },
                    name: {
                        string: "Partner Type",
                        type: 'char',
                    },
                },
                records: [],
            },
        });
        this.data['partner_type'].records.push(
            {
                display_name: "gold",
                email: "coucou@petite.perruche",
                id: 12,
            },
            {
                display_name: "silver",
                email: "",
                id: 14,
            },
        );
    },
    afterEach() {
        afterEach(this);
    },
});

QUnit.test('fieldmany2many tags email', async function (assert) {
    assert.expect(13);

    const done = assert.async();
    const user11 = this.data['res.users'].records.find(user => user.id === 11);
    user11.timmy = [12, 14];
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'read' && args.model === 'partner_type') {
                assert.step(JSON.stringify(args.args[0]));
                assert.deepEqual(
                    args.args[1],
                    ['display_name', 'email'],
                    "should read the email",
                );
            }
            return this._super(...arguments);
        },
    });
    // the modals need to be closed before the form view rendering
    createView({
        arch: `
            <form string="Partners">
                <sheet>
                    <field name="display_name"/>
                    <field name="timmy" widget="many2many_tags_email"/>
                </sheet>
            </form>
        `,
        archs: {
            'partner_type,false,form': `
                <form string="Types">
                    <field name="display_name"/>
                    <field name="email"/>
                </form>
            `,
        },
        env,
        model: 'res.users',
        res_id: 11,
        viewOptions: {
            mode: 'edit',
        },
        View: FormView,
    }).then(async form => {
        // should read it 3 times (1 with the form view, one with the form dialog and one after save)
        assert.verifySteps(['[12,14]', '[14]', '[14]']);

        await nextTick();
        assert.containsN(
            form,
            `
                .o_field_many2manytags[name="timmy"]
                .badge.o_tag_color_0
            `,
            2,
            "two tags should be present",
        );
        const firstTag = form.$(`
            .o_field_many2manytags[name="timmy"]
            .badge.o_tag_color_0
        `).first();
        assert.strictEqual(
            firstTag.find('.o_badge_text').text(),
            "gold",
            "tag should only show display_name",
        );
        assert.hasAttrValue(
            firstTag.find('.o_badge_text'),
            'title',
            "coucou@petite.perruche",
            "tag should show email address on mouse hover",
        );

        form.destroy();
        done();
    });
    nextTick().then(() => {
        assert.strictEqual(
            $('.modal-body.o_act_window').length,
            1,
            "there should be one modal opened to edit the empty email",
        );
        assert.strictEqual(
            $('.modal-body.o_act_window input[name="display_name"]').val(),
            "silver",
            "the opened modal should be a form view dialog with the partner_type 14",
        );
        assert.strictEqual(
            $('.modal-body.o_act_window input[name="email"]').length,
            1,
            "there should be an email field in the modal",
        );

        // set the email and save the modal (will render the form view)
        editInput(
            $('.modal-body.o_act_window input[name="email"]'),
            'coucou@petite.perruche',
        );
        click($('.modal-footer .btn-primary'));
    });

});

QUnit.test('fieldmany2many tags email (edition)', async function (assert) {
    assert.expect(15);

    const user11 = this.data['res.users'].records.find(user => user.id === 11);
    user11.timmy = [12];
    createServer(this.data);
    const env = await createEnv({
        async mockRPC(route, args) {
            if (args.method === 'read' && args.model === 'partner_type') {
                assert.step(JSON.stringify(args.args[0]));
                assert.deepEqual(
                    args.args[1],
                    ['display_name', 'email'],
                    "should read the email",
                );
            }
            return this._super(...arguments);
        },
    });
    const form = await createView({
        arch: `
            <form string="Partners">
                <sheet>
                    <field name="display_name"/>
                    <field name="timmy" widget="many2many_tags_email"/>
                </sheet>
            </form>
        `,
        archs: {
            'partner_type,false,form': '<form string="Types"><field name="display_name"/><field name="email"/></form>',
        },
        env,
        model: 'res.users',
        res_id: 11,
        View: FormView,
        viewOptions: {
            mode: 'edit',
        },
    });
    assert.verifySteps(['[12]']);
    assert.containsOnce(
        form,
        `
            .o_field_many2manytags[name="timmy"]
            .badge.o_tag_color_0
        `,
        "should contain one tag",
    );

    // add an other existing tag
    await clickOpenM2ODropdown('timmy');
    await clickM2OHighlightedItem('timmy');
    assert.strictEqual(
        $('.modal-body.o_act_window').length,
        1,
        "there should be one modal opened to edit the empty email",
    );
    assert.strictEqual(
        $('.modal-body.o_act_window input[name="display_name"]').val(),
        "silver",
        "the opened modal in edit mode should be a form view dialog with the partner_type 14",
    );
    assert.strictEqual(
        $('.modal-body.o_act_window input[name="email"]').length,
        1,
        "there should be an email field in the modal",
    );

    // set the email and save the modal (will rerender the form view)
    await editInput(
        $('.modal-body.o_act_window input[name="email"]'),
        'coucou@petite.perruche',
    );
    await click($('.modal-footer .btn-primary'));
    assert.containsN(
        form,
        `
            .o_field_many2manytags[name="timmy"]
            .badge.o_tag_color_0
        `,
        2,
        "should contain the second tag",
    );
    // should have read [14] three times: when opening the dropdown, when opening the modal, and
    // after the save
    assert.verifySteps(['[14]', '[14]', '[14]']);

    form.destroy();
});

QUnit.test('many2many_tags_email widget can load more than 40 records', async function (assert) {
    assert.expect(3);

    const user11 = this.data['res.users'].records.find(user => user.id === 11);
    this.data['res.users'].fields.partner_ids = {
        relation: 'res.users',
        string: "Partner",
        type: 'many2many',
    };
    user11.partner_ids = [];
    for (let i = 100; i < 200; i++) {
        this.data['res.users'].records.push({
            display_name: `partner${i}`,
            id: i,
        });
        user11.partner_ids.push(i);
    }
    createServer(this.data);
    const env = await createEnv();
    const form = await createView({
        arch: '<form><field name="partner_ids" widget="many2many_tags"/></form>',
        env,
        model: 'res.users',
        res_id: 11,
        View: FormView,
    });
    assert.strictEqual(
        form.$('.o_field_widget[name="partner_ids"] .badge').length,
        100,
    );

    await clickEdit(form);
    assert.hasClass(form.$('.o_form_view'), 'o_form_editable');

    // add a record to the relation
    await clickOpenM2ODropdown('partner_ids');
    await clickM2OHighlightedItem('partner_ids');
    assert.strictEqual(
        form.$('.o_field_widget[name="partner_ids"] .badge').length,
        101,
    );

    form.destroy();
});

});
});
});
