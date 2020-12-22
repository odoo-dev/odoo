odoo.define('web.crashmanager_tests', function (require) {
"use strict";

const AbstractView = require('web.AbstractView');
const CrashManager = require('web.CrashManager').CrashManager;

const testUtils = require('web.test_utils');
const createView = testUtils.createView;

QUnit.module('Services', {
    beforeEach: function () {
        this.viewParams = {
            View: AbstractView,
            arch: '<fake/>',
            data: {
                fake_model: {
                    fields: {},
                    record: [],
                },
            },
            model: 'fake_model',
            services: {
                crash_manager: CrashManager,
            },
        };
    }
}, function () {
    QUnit.module('Crash Manager');

    QUnit.test('Do not display same warning twice', async function (assert) {
        assert.expect(2);

        const view = await createView(this.viewParams);
        view.call('crash_manager', 'rpc_error', {
            data: {
                name: 'odoo.exceptions.UserError',
                arguments: ['this is test message'],
            }
        });
        await testUtils.nextTick();
        assert.containsOnce($, '.modal.o_technical_modal.show',
            "Warning modal should be opened");
        view.call('crash_manager', 'rpc_error', {
            data: {
                name: 'odoo.exceptions.UserError',
                arguments: ['this is test message'],
            }
        });
        await testUtils.nextTick();
        assert.containsOnce($, '.modal.o_technical_modal.show',
            "Warning modal should be opened");

        view.destroy();
    });

});
});
