/** @odoo-module **/
import { getFixture, makeTestEnv } from "../../helpers/index";
import { getTestViewRegistry, getTestServiceRegistry } from "../../helpers/index";
import { View } from "../../../src/views/view_utils/view";

import { viewRegistry } from "../../../src/views/view_registry"; // to remove when legacy support ends

const { mount, tags } = owl;
const { xml } = tags;

let env;
let serverData;
let target;
let testViewRegistry;
let testServiceRegistry;

class ListExtension extends Component {
  static type = "list";
  static display_name = "list";
  static icon = "fa-list-ul";
  static multiRecord = true;
  static template = xml`<div class='o_list_view'>List Extension content</div>`;
}

QUnit.module("Views", (hooks) => {
  hooks.beforeEach(async () => {
    serverData = {
      models: {
        animal: {
          fields: {
            id: { string: "Id", type: "integer" },
            name: { string: "Name", type: "char", store: true },
          },
          records: [
            { id: 1, name: "Cat" },
            { id: 2, name: "Dog" },
          ],
        },
      },
      views: {
        "animal,false,graph": `<graph/>`,
        "animal,false,list": `<list><field name="name"/><list/>`,
        "animal,1,list": `<list js_class="list_extension"><field name="name"/><list/>`,
        "animal,false,search": `<search/>`,
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
    assert.expect(1);
    const props = { model: "animal", type: "graph" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el, "o_action o_view_controller o_graph_view");
    view.unmount();
  });

  QUnit.test("simple rendering of a legacy view", async function (assert) {
    assert.expect(2);
    const props = { model: "animal", type: "list" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el, "o_action o_view_controller");
    assert.containsOnce(view, ".o_list_view");
    view.unmount();
  });

  QUnit.test("simple rendering with given arch", async function (assert) {
    assert.expect(1);
    const props = { model: "animal", type: "graph", arch: "<graph type='line'/>" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el.querySelector(`.o_graph_button[data-mode="line"`), "active");
    view.unmount();
  });

  QUnit.test("simple rendering with given prop", async function (assert) {
    assert.expect(1);
    const props = { model: "animal", type: "graph", mode: "line" };
    const view = await mount(View, { env, target, props });
    assert.hasClass(view.el.querySelector(`.o_graph_button[data-mode="line"`), "active");
    view.unmount();
  });

  QUnit.test("simple rendering with given jsClass", async function (assert) {
    assert.expect(1);
    const props = { model: "animal", jsClass: "list_extension" };
    const view = await mount(View, { env, target, props });
    assert.strictEqual(view.el.innerText, "List Extension content");
    view.unmount();
  });

  QUnit.test("simple rendering with arch attribute 'js_class'", async function (assert) {
    assert.expect(1);
    const props = { model: "animal", type: "list", views: [[1, "list"]] };
    const view = await mount(View, { env, target, props });
    assert.strictEqual(view.el.innerText, "List Extension content");
    view.unmount();
  });
});
