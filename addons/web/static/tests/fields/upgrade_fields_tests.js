odoo.define('web.upgrade_fields_tests', function (require) {
"use strict";

var FormView = require('web.FormView');
var testUtils = require('web.test_utils');

var createView = testUtils.createAsyncView;

QUnit.module('fields', {}, function () {

QUnit.module('upgrade_fields', {
    beforeEach: function () {
        this.data = {
            partner: {
                fields: {
                    bar: {string: "Bar", type: "boolean"},
                },
            }
        };
    },
}, function () {

    QUnit.module('UpgradeBoolean');

    QUnit.test('widget upgrade_boolean in a form view', async function (assert) {
        assert.expect(1);

        var form = await createView({
            View: FormView,
            model: 'partner',
            data: this.data,
            arch: '<form><field name="bar" widget="upgrade_boolean"/></form>',
        });

        await testUtils.dom.click(form.$('input:checkbox'));
        assert.strictEqual($('.modal').length, 1,
            "the 'Upgrade to Enterprise' dialog should be opened");

        form.destroy();
    });

    QUnit.test('widget upgrade_boolean in a form view', async function (assert) {
        assert.expect(3);

        var form = await createView({
            View: FormView,
            model: 'partner',
            data: this.data,
            arch: '<form>' +
                    '<div class="o_field"><field name="bar" widget="upgrade_boolean"/></div>' +
                    '<div class="o_label"><label for="bar"/><div>Coucou</div></div>' +
                '</form>',
        });

        assert.containsNone(form, '.o_field .badge',
            "the upgrade badge shouldn't be inside the field section");
        assert.containsOnce(form, '.o_label .badge',
            "the upgrade badge should be inside the label section");
        assert.strictEqual(form.$('.o_label').text(), "Bar EnterpriseCoucou",
            "the upgrade label should be inside the label section");
        form.destroy();
    });

});
});
});
