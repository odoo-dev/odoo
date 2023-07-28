/** @odoo-module **/

import { makeTestEnv } from "@web/../tests/helpers/mock_env";
import { getFixture, nextTick } from "@web/../tests/helpers/utils";
import { SearchBarMenu } from "@web/search/search_bar_menu/search_bar_menu";
import { WithSearch } from "@web/search/with_search/with_search";
import { mount } from "../helpers/utils";
import {
    getMenuItemTexts,
    makeWithSearch,
    setupControlPanelServiceRegistry,
    toggleSearchBarMenu,
    toggleMenuItem,
} from "./helpers";

import { Component, onWillUpdateProps, onWillStart, useState, xml } from "@odoo/owl";

let target;
let serverData;

QUnit.module("Search", (hooks) => {
    hooks.beforeEach(async () => {
        serverData = {
            models: {
                animal: {
                    fields: {
                        birthday: { string: "Birthday", type: "date", store: true },
                        type: {
                            string: "Type",
                            type: "selection",
                            selection: [
                                ["omnivorous", "Omnivorous"],
                                ["herbivorous", "Herbivorous"],
                                ["carnivorous", "Carnivorous"],
                            ],
                            store: true,
                        },
                    },
                },
            },
            views: {
                "animal,false,search": `<search/>`,
                "animal,1,search": `
          <search>
            <filter name="filter" string="True domain" domain="[(1, '=', 1)]"/>
            <filter name="group_by" context="{ 'group_by': 'name' }"/>
          </search>
        `,
            },
        };
        setupControlPanelServiceRegistry();
        target = getFixture();
    });

    QUnit.module("WithSearch");

    QUnit.test("simple rendering", async function (assert) {
        assert.expect(2);

        class TestComponent extends Component {}
        TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

        await makeWithSearch({
            serverData,
            resModel: "animal",
            Component: TestComponent,
        });
        assert.containsOnce(target, ".o_test_component");
        assert.strictEqual(
            target.querySelector(".o_test_component").innerText,
            "Test component content"
        );
    });

    QUnit.test("search model in sub env", async function (assert) {
        assert.expect(1);

        class TestComponent extends Component {}
        TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

        const component = await makeWithSearch({
            serverData,
            resModel: "animal",
            Component: TestComponent,
        });
        assert.ok(component.env.searchModel);
    });

    QUnit.test(
        "search query props are passed as props to concrete component",
        async function (assert) {
            assert.expect(4);

            class TestComponent extends Component {
                setup() {
                    const { context, domain, groupBy, orderBy } = this.props;
                    assert.deepEqual(context, {
                        lang: "en",
                        tz: "taht",
                        uid: 7,
                        key: "val",
                    });
                    assert.deepEqual(domain, [[0, "=", 1]]);
                    assert.deepEqual(groupBy, ["birthday"]);
                    assert.deepEqual(orderBy, [{ name: "bar", asc: true }]);
                }
            }
            TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

            await makeWithSearch({
                serverData,
                resModel: "animal",
                Component: TestComponent,
                domain: [[0, "=", 1]],
                groupBy: ["birthday"],
                context: { key: "val" },
                orderBy: [{ name: "bar", asc: true }],
            });
        }
    );

    QUnit.test("do not load search view description by default", async function (assert) {
        assert.expect(1);

        class TestComponent extends Component {}
        TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

        await makeWithSearch({
            serverData,
            mockRPC: function (_, args) {
                if (args.method === "get_views") {
                    throw new Error("No get_views should be done");
                }
            },
            resModel: "animal",
            Component: TestComponent,
        });

        assert.ok(true);
    });

    QUnit.test(
        "load search view description if not provided and loadSearchView=true",
        async function (assert) {
            assert.expect(1);

            class TestComponent extends Component {}
            TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

            await makeWithSearch({
                serverData,
                mockRPC: function (_, args) {
                    if (args.method === "get_views") {
                        assert.deepEqual(args.kwargs, {
                            context: {
                                lang: "en",
                                tz: "taht",
                                uid: 7,
                            },
                            options: {
                                action_id: false,
                                load_filters: false,
                                toolbar: false,
                            },
                            views: [[false, "search"]],
                        });
                    }
                },
                resModel: "animal",
                Component: TestComponent,
                searchViewId: false,
            });
        }
    );

    QUnit.test(
        "do not load the search view description if provided even if loadSearchView=true",
        async function (assert) {
            assert.expect(1);

            class TestComponent extends Component {}
            TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

            await makeWithSearch({
                serverData,
                mockRPC: function (_, args) {
                    if (args.method === "get_views") {
                        throw new Error("No get_views should be done");
                    }
                },
                resModel: "animal",
                Component: TestComponent,
                searchViewArch: "<search/>",
                searchViewFields: {},
                searchViewId: false,
            });
            assert.ok(true);
        }
    );

    QUnit.test(
        "load view description if it is not complete and loadSearchView=true",
        async function (assert) {
            assert.expect(1);

            class TestComponent extends Component {}
            TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

            await makeWithSearch({
                serverData,
                mockRPC: function (_, args) {
                    if (args.method === "get_views") {
                        assert.deepEqual(args.kwargs.options, {
                            action_id: false,
                            load_filters: true,
                            toolbar: false,
                        });
                    }
                },
                resModel: "animal",
                Component: TestComponent,
                searchViewArch: "<search/>",
                searchViewFields: {},
                searchViewId: true,
                loadIrFilters: true,
            });
        }
    );

    QUnit.test(
        "load view description with given id if it is not provided and loadSearchView=true",
        async function (assert) {
            assert.expect(3);

            class TestComponent extends Component {}
            TestComponent.components = { SearchBarMenu };
            TestComponent.template = xml`
                <div class="o_test_component">
                    <SearchBarMenu/>
                </div>
            `;

            await makeWithSearch({
                serverData,
                mockRPC: function (_, args) {
                    if (args.method === "get_views") {
                        assert.deepEqual(args.kwargs.views, [[1, "search"]]);
                    }
                },
                resModel: "animal",
                Component: TestComponent,
                searchViewId: 1,
            });
            await toggleSearchBarMenu(target);
            await assert.ok(getMenuItemTexts(target), ["True Domain"]);

            await toggleSearchBarMenu(target);
            await assert.ok(getMenuItemTexts(target), ["Name"]);
        }
    );

    QUnit.test(
        "toggle a filter render the underlying component with an updated domain",
        async function (assert) {
            assert.expect(2);

            class TestComponent extends Component {
                setup() {
                    owl.onWillStart(() => {
                        assert.deepEqual(this.props.domain, []);
                    });
                    owl.onWillUpdateProps((nextProps) => {
                        assert.deepEqual(nextProps.domain, [[1, "=", 1]]);
                    });
                }
            }
            TestComponent.components = { SearchBarMenu };
            TestComponent.template = xml`
                <div class="o_test_component">
                    <SearchBarMenu/>
                </div>
            `;

            await makeWithSearch({
                serverData,
                resModel: "animal",
                Component: TestComponent,
                searchViewId: 1,
            });
            await toggleSearchBarMenu(target);
            await toggleMenuItem(target, "True domain");
        }
    );

    QUnit.test("react to prop 'domain' changes", async function (assert) {
        assert.expect(2);

        class TestComponent extends Component {
            setup() {
                onWillStart(() => {
                    assert.deepEqual(this.props.domain, [["type", "=", "carnivorous"]]);
                });
                onWillUpdateProps((nextProps) => {
                    assert.deepEqual(nextProps.domain, [["type", "=", "herbivorous"]]);
                });
            }
        }
        TestComponent.template = xml`<div class="o_test_component">Test component content</div>`;

        const env = await makeTestEnv(serverData);
        const target = getFixture();

        class Parent extends Component {
            setup() {
                owl.useSubEnv({ config: {} });
                this.searchState = useState({
                    resModel: "animal",
                    domain: [["type", "=", "carnivorous"]],
                });
            }
        }
        Parent.template = xml`
            <WithSearch t-props="searchState" t-slot-scope="search">
                <TestComponent
                    domain="search.domain"
                />
            </WithSearch>
        `;
        Parent.components = { WithSearch, TestComponent };

        const parent = await mount(Parent, target, { env });
        parent.searchState.domain = [["type", "=", "herbivorous"]];

        await nextTick();
    });
});
