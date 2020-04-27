odoo.define('mail.chatter_tests', function (require) {
"use strict";

var FormView = require('web.FormView');
var testUtils = require('web.test_utils');
var createView = testUtils.createView;


QUnit.module('mail', {}, function () {

QUnit.module('FieldMany2ManyTagsEmail', {
    beforeEach: function () {
        this.data = {
            partner: {
                fields: {
                    display_name: { string: "Displayed name", type: "char" },
                    timmy: { string: "pokemon", type: "many2many", relation: 'partner_type'},
                },
                records: [{
                    id: 1,
                    display_name: "first record",
                    timmy: [],
                }],
            },
            partner_type: {
                fields: {
                    name: {string: "Partner Type", type: "char"},
                    email: {string: "Email", type: "char"},
                },
                records: [
                    {id: 12, display_name: "gold", email: 'coucou@petite.perruche'},
                    {id: 14, display_name: "silver", email: ''},
                ]
            },
        };
    },
});

QUnit.test('fieldmany2many tags email', function (assert) {
    assert.expect(13);
    var done = assert.async();

    this.data.partner.records[0].timmy = [12, 14];

    // the modals need to be closed before the form view rendering
    createView({
        View: FormView,
        model: 'partner',
        data: this.data,
        res_id: 1,
        arch:'<form string="Partners">' +
                '<sheet>' +
                    '<field name="display_name"/>' +
                    '<field name="timmy" widget="many2many_tags_email"/>' +
                '</sheet>' +
            '</form>',
        viewOptions: {
            mode: 'edit',
        },
        mockRPC: function (route, args) {
            if (args.method ==='read' && args.model === 'partner_type') {
                assert.step(JSON.stringify(args.args[0]));
                assert.deepEqual(args.args[1] , ['display_name', 'email'], "should read the email");
            }
            return this._super.apply(this, arguments);
        },
        archs: {
            'partner_type,false,form': '<form string="Types"><field name="display_name"/><field name="email"/></form>',
        },
    }).then(async function (form) {
        // should read it 3 times (1 with the form view, one with the form dialog and one after save)
        assert.verifySteps(['[12,14]', '[14]', '[14]']);
        await testUtils.nextTick();
        assert.containsN(form, '.o_field_many2manytags[name="timmy"] .badge.o_tag_color_0', 2,
            "two tags should be present");
        var firstTag = form.$('.o_field_many2manytags[name="timmy"] .badge.o_tag_color_0').first();
        assert.strictEqual(firstTag.find('.o_badge_text').text(), "gold",
            "tag should only show display_name");
        assert.hasAttrValue(firstTag.find('.o_badge_text'), 'title', "coucou@petite.perruche",
            "tag should show email address on mouse hover");
        form.destroy();
        done();
    });
    testUtils.nextTick().then(function() {
        assert.strictEqual($('.modal-body.o_act_window').length, 1,
            "there should be one modal opened to edit the empty email");
        assert.strictEqual($('.modal-body.o_act_window input[name="display_name"]').val(), "silver",
            "the opened modal should be a form view dialog with the partner_type 14");
        assert.strictEqual($('.modal-body.o_act_window input[name="email"]').length, 1,
            "there should be an email field in the modal");

        // set the email and save the modal (will render the form view)
        testUtils.fields.editInput($('.modal-body.o_act_window input[name="email"]'), 'coucou@petite.perruche');
        testUtils.dom.click($('.modal-footer .btn-primary'));
    });

});

QUnit.test('fieldmany2many tags email (edition)', async function (assert) {
    assert.expect(15);

    this.data.partner.records[0].timmy = [12];

    var form = await createView({
        View: FormView,
        model: 'partner',
        data: this.data,
        res_id: 1,
        arch:'<form string="Partners">' +
                '<sheet>' +
                    '<field name="display_name"/>' +
                    '<field name="timmy" widget="many2many_tags_email"/>' +
                '</sheet>' +
            '</form>',
        viewOptions: {
            mode: 'edit',
        },
        mockRPC: function (route, args) {
            if (args.method ==='read' && args.model === 'partner_type') {
                assert.step(JSON.stringify(args.args[0]));
                assert.deepEqual(args.args[1] , ['display_name', 'email'], "should read the email");
            }
            return this._super.apply(this, arguments);
        },
        archs: {
            'partner_type,false,form': '<form string="Types"><field name="display_name"/><field name="email"/></form>',
        },
    });

    assert.verifySteps(['[12]']);
    assert.containsOnce(form, '.o_field_many2manytags[name="timmy"] .badge.o_tag_color_0',
        "should contain one tag");

    // add an other existing tag
    await testUtils.fields.many2one.clickOpenDropdown('timmy');
    await testUtils.fields.many2one.clickHighlightedItem('timmy');

    assert.strictEqual($('.modal-body.o_act_window').length, 1,
        "there should be one modal opened to edit the empty email");
    assert.strictEqual($('.modal-body.o_act_window input[name="display_name"]').val(), "silver",
        "the opened modal in edit mode should be a form view dialog with the partner_type 14");
    assert.strictEqual($('.modal-body.o_act_window input[name="email"]').length, 1,
        "there should be an email field in the modal");

    // set the email and save the modal (will rerender the form view)
    await testUtils.fields.editInput($('.modal-body.o_act_window input[name="email"]'), 'coucou@petite.perruche');
    await testUtils.dom.click($('.modal-footer .btn-primary'));

    assert.containsN(form, '.o_field_many2manytags[name="timmy"] .badge.o_tag_color_0', 2,
        "should contain the second tag");
    // should have read [14] three times: when opening the dropdown, when opening the modal, and
    // after the save
    assert.verifySteps(['[14]', '[14]', '[14]']);

    form.destroy();
});

QUnit.test('many2many_tags_email widget can load more than 40 records', async function (assert) {
    assert.expect(3);

    this.data.partner.fields.partner_ids = {string: "Partner", type: "many2many", relation: 'partner'};
    this.data.partner.records[0].partner_ids = [];
    for (let i = 100; i < 200; i++) {
        this.data.partner.records.push({id: i, display_name: `partner${i}`});
        this.data.partner.records[0].partner_ids.push(i);
    }

    const form = await createView({
        View: FormView,
        model: 'partner',
        data: this.data,
        arch: '<form><field name="partner_ids" widget="many2many_tags"/></form>',
        res_id: 1,
    });

    assert.strictEqual(form.$('.o_field_widget[name="partner_ids"] .badge').length, 100);

    await testUtils.form.clickEdit(form);

    assert.hasClass(form.$('.o_form_view'), 'o_form_editable');

    // add a record to the relation
    await testUtils.fields.many2one.clickOpenDropdown('partner_ids');
    await testUtils.fields.many2one.clickHighlightedItem('partner_ids');

    assert.strictEqual(form.$('.o_field_widget[name="partner_ids"] .badge').length, 101);

    form.destroy();
});

});
});
