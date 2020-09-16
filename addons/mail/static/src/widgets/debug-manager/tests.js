/** @odoo-module alias=mail.widgets.DebugManager.tests **/

import { createDebugManager, nextTick } from 'web.test_utils';
import { click } from 'web.test_utils_dom';

QUnit.module('mail', {}, function () {
QUnit.module('widgets', {}, function () {
QUnit.module('DebugManager', {}, function () {

QUnit.test('tests', async function (assert) {
    assert.expect(3);

    const debugManager = await createDebugManager({
        intercepts: {
            do_action(ev) {
                assert.deepEqual(
                    ev.data.action,
                    {
                        context: {
                            default_res_id: 5,
                            default_res_model: 'testModel',
                        },
                        domain: [['res_id', '=', 5], ['model', '=', 'testModel']],
                        name: "Manage Messages",
                        res_model: 'mail.message',
                        type: 'ir.actions.act_window',
                        views: [[false, 'list'], [false, 'form']],
                    },
                );
            },
        },
    });
    await debugManager.appendTo($('#qunit-fixture'));
    // Simulate update debug manager from web client
    const action = {
        views: [{
            displayName: "Form",
            fieldsView: {
                view_id: 1,
            },
            type: "form",
        }],
    };
    const view = {
        viewType: 'form',
        getSelectedIds() {
            return [5];
        },
        modelName: 'testModel',
    };
    await nextTick();
    await debugManager.update('action', action, view);
    const $messageMenu = debugManager.$('a[data-action=getMailMessages]');
    assert.strictEqual($messageMenu.length, 1, "should have Manage Message menu item");
    assert.strictEqual($messageMenu.text().trim(), "Manage Messages",
        "should have correct menu item text");

    await click(debugManager.$('> a')); // open dropdown
    await click($messageMenu);

    debugManager.destroy();
});

});
});
});
