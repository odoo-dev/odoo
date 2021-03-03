odoo.define("base.abstract_controller_tests", function (require) {
"use strict";

const { xml } = owl.tags;

var testUtils = require("web.test_utils");
var createView = testUtils.createView;
var BasicView = require("web.BasicView");
var BasicRenderer = require("web.BasicRenderer");
const AbstractRenderer = require('web.AbstractRendererOwl');
const RendererWrapper = require('web.RendererWrapper');
const createActionManager = testUtils.createActionManager;

function getHtmlRenderer(html) {
    return BasicRenderer.extend({
        start: function () {
            this.$el.html(html);
            return this._super.apply(this, arguments);
        }
    });
}

function getOwlView(owlRenderer, viewType) {
    viewType = viewType || "test";
    return BasicView.extend({
        viewType: viewType,
        config: _.extend({}, BasicView.prototype.config, {
            Renderer: owlRenderer,
        }),
        getRenderer() {
            return new RendererWrapper(null, this.config.Renderer, {});
        }
    });
}

function getHtmlView(html, viewType) {
    viewType = viewType || "test";
    return BasicView.extend({
        viewType: viewType,
        config: _.extend({}, BasicView.prototype.config, {
            Renderer: getHtmlRenderer(html)
        })
    });
}

QUnit.module("Views", {
    beforeEach: function () {
        this.data = {
            test_model: {
                fields: {},
                records: []
            }
        };
    }
}, function () {
    QUnit.module('AbstractController');

    QUnit.test('click on a a[type="action"] child triggers the correct action', async function (assert) {
        assert.expect(7);

        var html =
            "<div>" +
            '<a name="a1" type="action" class="simple">simple</a>' +
            '<a name="a2" type="action" class="with-child">' +
            "<span>child</input>" +
            "</a>" +
            '<a type="action" data-model="foo" data-method="bar" class="method">method</a>' +
            '<a type="action" data-model="foo" data-res-id="42" class="descr">descr</a>' +
            '<a type="action" data-model="foo" class="descr2">descr2</a>' +
            "</div>";

        var view = await createView({
            View: getHtmlView(html, "test"),
            data: this.data,
            model: "test_model",
            arch: "<test/>",
            intercepts: {
                do_action: function (event) {
                    assert.step(event.data.action.name || event.data.action);
                }
            },
            mockRPC: function (route, args) {
                if (args.model === 'foo' && args.method === 'bar') {
                    assert.step("method");
                    return Promise.resolve({name: 'method'});
                }
                return this._super.apply(this, arguments);
            }
        });
        await testUtils.dom.click(view.$(".simple"));
        await testUtils.dom.click(view.$(".with-child span"));
        await testUtils.dom.click(view.$(".method"));
        await testUtils.dom.click(view.$(".descr"));
        await testUtils.dom.click(view.$(".descr2"));
        assert.verifySteps(["a1", "a2", "method", "method", "descr", "descr2"]);

        view.destroy();
    });

    QUnit.test('OWL Renderer correctly destroyed', async function (assert) {
        assert.expect(2);

        class Renderer extends AbstractRenderer {
            __destroy() {
                assert.step("destroy");
                super.__destroy();
            }
        }
        Renderer.template = xml`<div>Test</div>`;

        var view = await createView({
            View: getOwlView(Renderer, "test"),
            data: this.data,
            model: "test_model",
            arch: "<test/>",
        });
        view.destroy();

        assert.verifySteps(["destroy"]);

    });

    QUnit.test('Correctly set focus to search panel with Owl Renderer', async function (assert) {
        assert.expect(1);

        class Renderer extends AbstractRenderer { }
        Renderer.template = xml`<div>Test</div>`;

        var view = await createView({
            View: getOwlView(Renderer, "test"),
            data: this.data,
            model: "test_model",
            arch: "<test/>",
        });
        assert.hasClass(document.activeElement, "o_searchview_input");
        view.destroy();
    });

    QUnit.test('foucus should be on search bar after changing view', async function (assert) {
        assert.expect(2);

        this.partnedata = {
            partner: {
                fields: {
                    display_name: { string: "Displayed name", type: "char" },
                },
                records: [
                    {id: 1, display_name: "gideon"},
                ],
            },
        };
        this.actions = [{
            id: 1,
            name: 'Partners Action 4',
            res_model: 'partner',
            type: 'ir.actions.act_window',
            views: [[1, 'kanban'], [false, 'form']],
        }];

        this.archs = {
            // kanban views
            'partner,1,kanban': '<kanban><templates><t t-name="kanban-box">' +
                    '<div class="oe_kanban_global_click">' +
                    '<field name="display_name"/>' +
                    '</div>' +
                '</t></templates></kanban>',
            // form views
            'partner,false,form': '<form>' +
                    '<group>' +
                        '<field name="display_name"/>' +
                    '</group>' +
                '</form>',
             // search views
            'partner,false,search': '<search></search>',
        };
        var actionManager = await createActionManager({
            actions: this.actions,
            archs: this.archs,
            data: this.partnedata,
        });
        await actionManager.doAction(1);
        assert.hasClass(document.activeElement, "o_searchview_input");
        await testUtils.dom.click(actionManager.$('.oe_kanban_global_click'));
        await testUtils.dom.click(actionManager.$('.o_back_button'));
        assert.hasClass(document.activeElement, "o_searchview_input");
        actionManager.destroy();
    });

    QUnit.test('Owl Renderer mounted/willUnmount hooks are properly called', async function (assert) {
        // This test could be removed as soon as controllers and renderers will
        // both be converted in Owl.
        assert.expect(3);

        class Renderer extends AbstractRenderer {
            mounted() {
                assert.step("mounted");
            }
            willUnmount() {
                assert.step("unmounted");
            }
        }
        Renderer.template = xml`<div>Test</div>`;

        const view = await createView({
            View: getOwlView(Renderer, "test"),
            data: this.data,
            model: "test_model",
            arch: "<test/>",
        });

        view.destroy();

        assert.verifySteps([
            "mounted",
            "unmounted",
        ]);
    });
});
});
