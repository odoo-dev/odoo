odoo.define('web_editor.we3_tests', function (require) {
"use strict";

var ajax = require('web.ajax');
var FormView = require('web.FormView');
var testUtils = require('web.test_utils');
var weTestUtils = require('web_editor.test_utils');
var Wysiwyg = require('web_editor.wysiwyg');


QUnit.module('web_editor', {}, function () {


QUnit.module('we3', {
    beforeEach: function () {
        this.data = weTestUtils.wysiwygData({
            'note.note': {
                fields: {
                    display_name: {
                        string: "Displayed name",
                        type: "char"
                    },
                    body: {
                        string: "Message",
                        type: "html"
                    },
                },
                records: [{
                    id: 1,
                    display_name: "first record",
                    body: "<p>toto toto toto</p><p>tata</p>",
                }],
            },
        });

        testUtils.mock.patch(ajax, {
            loadAsset: function (xmlId) {
                if (xmlId === 'template.assets') {
                    return Promise.resolve({
                        cssLibs: [],
                        cssContents: ['body {background-color: red;}']
                    });
                }
                if (xmlId === 'template.assets_all_style') {
                    return Promise.resolve({
                        cssLibs: $('link[href]:not([type="image/x-icon"])').map(function () {
                            return $(this).attr('href');
                        }).get(),
                        cssContents: ['body {background-color: red;}']
                    });
                }
                throw 'Wrong template';
            },
        });

        testUtils.mock.patch(Wysiwyg, {
            init: function () {
                this._super(...arguments);

                var assert;
                var resolve;
                this.trigger_up('assert_get', {
                    callback: function (a, r) {
                        assert = a;
                        resolve = r;
                    },
                });

                this.options = {
                    plugins: Object.assign({}, this.options.plugins, {
                        Test: true,
                    }),
                    test: Object.assign({
                        callback: resolve,
                        auto: true,
                        assert: assert,
                    }, this.options.test),
                };
            }
        });
    },
    afterEach: function () {
        testUtils.mock.unpatch(Wysiwyg);
        testUtils.mock.unpatch(ajax);
    },
}, function () {

    QUnit.module('basic');

    QUnit.test('simple rendering with only auto-install plugins', async function (assert) {
        assert.expect(372);

        var promise;
        var form = await testUtils.createView({
            View: FormView,
            model: 'note.note',
            data: this.data,
            arch: '<form><field name="body" widget="html" style="height: 100px"/></form>',
            interceptsPropagate: {
                assert_get: function (ev) {
                    promise = new Promise((resolve) => ev.data.callback(assert, resolve));
                }
            },
        });
        assert.strictEqual(form.$('we3-editor').length, 1, "Editor should be started");
        await promise;
        form.destroy();
    });

});

});
});
