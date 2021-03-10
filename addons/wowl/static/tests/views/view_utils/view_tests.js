/** @odoo-module **/
import {
  getFixture,
  getTestServiceRegistry,
  getTestViewRegistry,
  makeTestEnv,
} from "../../helpers";

import { View } from "../../../src/views/view_utils/view";

import { viewRegistry } from "../../../src/views/view_registry"; // to remove when legacy support ends

const { mount, tags } = owl;
const { xml } = tags;

let env;
let serverData;
let target;
let testViewRegistry;
let testServiceRegistry;

class ListExtension extends Component {}
ListExtension.template = xml`<div class='o_list_view'>List Extension content</div>`;
ListExtension.type = "list";
ListExtension.display_name = "list";
ListExtension.icon = "fa-list-ul";
ListExtension.multiRecord = true;

QUnit.module("Views", (hooks) => {
  hooks.beforeEach(async () => {
    serverData = {
      models: {
        animal: {
          fields: {
            id: { string: "Id", type: "integer" },
            name: { string: "Name", type: "char", store: true },
            birthday: { string: "Birthday", type: "date", store: true },
          },
          records: [
            { id: 1, name: "Cat", birthday: "2021-05-26" },
            { id: 2, name: "Dog", birthday: "2021-01-29" },
          ],
        },
      },
      views: {
        "animal,false,graph": `<graph/>`,
        "animal,false,list": `<list><field name="name"/></list>`,
        "animal,1,list": `<list js_class="list_extension"><field name="name"/></list>`,
        "animal,false,search": `<search/>`,
        "animal,1,search": `<search>
            <filter name="filter" domain="[(1, '=', 1)]"/>
            <filter name="group_by" context="{ 'group_by': 'name' }"/>
          </search>
        `,
      },
    };
    target = getFixture();
    testServiceRegistry = getTestServiceRegistry();
    testViewRegistry = getTestViewRegistry();
    testViewRegistry.add("list_extension", ListExtension);
    env = await makeTestEnv({
      serviceRegistry: testServiceRegistry,
      viewRegistry: testViewRegistry,
      serverData,
    });
  });

  // Remove this as soon as we drop the legacy support.
  // This is necessary as some tests add actions/views in the legacy registries,
  // which are in turned wrapped and added into the real wowl registries. We
  // add those actions/views in the test registries, and remove them from the
  // real ones (directly, as we don't need them in the test).
  const owner = Symbol("owner");
  hooks.beforeEach(() => {
    viewRegistry.on("UPDATE", owner, (payload) => {
      if (payload.operation === "add" && testViewRegistry) {
        testViewRegistry.add(payload.key, payload.value);
        viewRegistry.remove(payload.key);
      }
    });
  });
  hooks.afterEach(() => {
    viewRegistry.off("UPDATE", owner);
  });

  QUnit.module("View component");

  QUnit.test("simple rendering", async function (assert) {
    const props = { model: "animal", type: "graph" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el, "o_action o_view_controller o_graph_view");
    view.unmount();
  });

  QUnit.skip("simple rendering of a legacy view", async function (assert) {
    // don't really know what happpens
    const props = { model: "animal", type: "list" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el, "o_action o_view_controller");
    assert.containsOnce(view, ".o_list_view");
    view.unmount();
  });

  QUnit.test("simple rendering with given arch", async function (assert) {
    const props = { model: "animal", type: "graph", arch: "<graph type='line'/>" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el.querySelector(`.o_graph_button[data-mode="line"`), "active");
    view.unmount();
  });

  QUnit.test("simple rendering with given prop", async function (assert) {
    const props = { model: "animal", type: "graph", mode: "line" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el.querySelector(`.o_graph_button[data-mode="line"`), "active");
    view.unmount();
  });

  QUnit.test("simple rendering with given jsClass", async function (assert) {
    const props = { model: "animal", jsClass: "list_extension" };
    const view = await mount(View, { env, target, props });
    assert.strictEqual(view.el.innerText, "List Extension content");
    view.unmount();
  });

  QUnit.test("simple rendering with arch attribute 'js_class'", async function (assert) {
    const props = { model: "animal", type: "list", views: [[1, "list"]] };
    const view = await mount(View, { env, target, props });
    assert.strictEqual(view.el.innerText, "List Extension content");
    view.unmount();
  });

  QUnit.test("search model in sub env", async function (assert) {
    const props = { model: "animal", type: "graph" };
    const view = await mount(View, { env, target, props });
    assert.ok(view.env.searchModel);
    view.unmount();
  });

  QUnit.test(
    "search query props are passed as props (default search arch)",
    async function (assert) {
      class ToyView extends Component {
        constructor() {
          super(...arguments);
          const { context, domain, groupBy, orderBy } = this.props;
          assert.deepEqual(context, { key: "val" });
          assert.deepEqual(domain, [[0, "=", 1]]);
          assert.deepEqual(
            groupBy.map((gb) => gb.toJSON()),
            ["birthday"]
          );
          assert.deepEqual(orderBy, ["bar"]);
        }
      }
      ToyView.template = xml`<div/>`;
      ToyView.type = "list";
      ToyView.display_name = "list";
      ToyView.icon = "fa-list-ul";
      ToyView.multiRecord = true;
      ToyView.props = { context: true, domain: true, groupBy: true, orderBy: true };
      testViewRegistry.add("toy_view", ToyView);

      env = await makeTestEnv({
        serviceRegistry: testServiceRegistry,
        viewRegistry: testViewRegistry,
        serverData,
      });

      const props = {
        model: "animal",
        jsClass: "toy_view",
        domain: [[0, "=", 1]],
        groupBy: ["birthday"],
        context: { key: "val" },
        orderBy: ["bar"],
      };

      const view = await mount(View, { env, target, props });
      view.unmount();
    }
  );

  QUnit.test("search query props are passed as props (search arch)", async function (assert) {
    class ToyView extends Component {
      constructor() {
        super(...arguments);
        const { context, domain, groupBy, orderBy } = this.props;
        assert.deepEqual(context, {});
        assert.deepEqual(domain, ["&", [0, "=", 1], [1, "=", 1]]);
        assert.deepEqual(
          groupBy.map((gb) => gb.toJSON()),
          ["name"]
        );
        assert.deepEqual(orderBy, ["bar"]);
      }
    }
    ToyView.template = xml`<div/>`;
    ToyView.type = "list";
    ToyView.display_name = "list";
    ToyView.icon = "fa-list-ul";
    ToyView.multiRecord = true;
    ToyView.props = { context: true, domain: true, groupBy: true, orderBy: true };
    testViewRegistry.add("toy_view", ToyView);

    env = await makeTestEnv({
      serviceRegistry: testServiceRegistry,
      viewRegistry: testViewRegistry,
      serverData,
    });

    const props = {
      model: "animal",
      jsClass: "toy_view",
      views: [[1, "search"]],
      domain: [[0, "=", 1]],
      groupBy: ["birthday"],
      context: { search_default_filter: 1, search_default_group_by: 1 },
      orderBy: ["bar"],
    };

    const view = await mount(View, { env, target, props });
    view.unmount();
  });
});
