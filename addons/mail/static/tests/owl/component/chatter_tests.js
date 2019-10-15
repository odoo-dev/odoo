odoo.define('mail.component.ChatterTests', function (require) {
"use strict";

const Chatter = require('mail.component.Chatter');
const {
    afterEach: utilsAfterEach,
    beforeEach: utilsBeforeEach,
    pause,
    start: startUtils,
} = require('mail.owl.testUtils');

const testUtils = require('web.test_utils');

QUnit.module('mail.owl', {}, function () {
QUnit.module('component', {}, function () {
QUnit.module('Chatter', {
    beforeEach() {
        utilsBeforeEach(this);
        this.createChatter = async (resModel, resId, otherProps) => {
            const env = await this.widget.call('env', 'get');
            this.chatter = new Chatter(env, {
                resModel,
                resId,
                ...otherProps
            });
            await this.chatter.mount(this.widget.$el[0]);
        };
        this.start = async params => {
            if (this.widget) {
                this.widget.destroy();
            }
            let { store, widget } = await startUtils({
                ...params,
                data: this.data,
            });
            this.store = store;
            this.widget = widget;
        };
    },
    afterEach() {
        utilsAfterEach(this);
        if (this.chatter) {
            this.chatter.destroy();
        }
        if (this.widget) {
            this.widget.destroy();
        }
        this.store = undefined;
    }
});

QUnit.test('base rendering when chatter has no attachments', async function (assert) {
    assert.expect(2);

    await this.start({
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [];
            }
            return this._super(...arguments);
        }
    });
    await this.createChatter('res.partner', '100');
    await testUtils.nextTick();

    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_Chatter`)
            .length,
        1,
        "should have a chatter");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_Chatter
                .o_Chatter_attachmentBox`)
            .length,
        1,
        "should have an attachment box in the chatter");
});

QUnit.test('base rendering when chatter has attachments', async function (assert) {
    assert.expect(2);

    await this.start({
        debug: true,
        async mockRPC(route, args) {
            if (route.includes('ir.attachment/search_read')) {
                return [{
                    id: 143,
                    filename: 'Blah.txt',
                    mimetype: 'text/plain',
                    name: 'Blah.txt'
                }, {
                    id: 144,
                    filename: 'Blu.txt',
                    mimetype: 'text/plain',
                    name: 'Blu.txt'
                }];
            }
            return this._super(...arguments);
        }
    });
    await this.createChatter('res.partner', '100');
    await testUtils.nextTick();

    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_Chatter`)
            .length,
        1,
        "should have a chatter");
    assert.strictEqual(
        document
            .querySelectorAll(`
                .o_Chatter
                .o_Chatter_attachmentBox`)
            .length,
        1,
        "should have an attachment box in the chatter");

    await pause();
});

});
});
});
