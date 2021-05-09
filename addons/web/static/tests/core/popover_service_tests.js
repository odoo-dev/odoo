/** @odoo-module **/

import { mainComponentRegistry } from "@web/core/main_component_registry";
import { Popover } from "@web/core/popover/popover";
import {
    KeyAlreadyExistsError,
    KeyNotFoundError,
    PopoverManager,
    popoverService,
} from "@web/core/popover/popover_service";
import { serviceRegistry } from "@web/core/service_registry";
import { clearRegistryWithCleanup, makeTestEnv } from "../helpers/mock_env";
import { click, getFixture, nextTick } from "../helpers/utils";

const { Component, mount } = owl;
const { xml } = owl.tags;

let env;
let target;

class PseudoWebClient extends Component {
    setup() {
        this.Components = mainComponentRegistry.getEntries();
    }
}
PseudoWebClient.template = xml`
  <div>
    <div id="anchor">Anchor</div>
    <div id="close">Close</div>

    <div>
      <t t-foreach="Components" t-as="Component" t-key="Component[0]">
        <t t-component="Component[1]"/>
      </t>
    </div>
  </div>
`;

QUnit.module("PopoverManager", {
    async beforeEach() {
        target = getFixture();
        serviceRegistry.add("popover", popoverService);
        clearRegistryWithCleanup(mainComponentRegistry);
        mainComponentRegistry.add("PopoverManager", PopoverManager);
        env = await makeTestEnv();
    },
});

QUnit.test("Render custom popover component", async function (assert) {
    assert.expect(10);

    class CustomPopover extends Component {}
    CustomPopover.components = { Popover };
    CustomPopover.template = xml`
    <Popover target="props.target">
      <t t-set-slot="content">
        <div>Popover</div>
      </t>
    </Popover>
  `;

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    assert.containsOnce(target, ".o_popover_manager");
    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsNone(target, ".o_popover_manager > div:not(.o_popover_container)");

    env.services.popover.add({
        Component: CustomPopover,
        props: {
            target: "#anchor",
        },
    });
    await nextTick();

    await click(target, "#anchor");
    assert.containsOnce(target, ".o_popover_manager portal");
    assert.containsOnce(target, ".o_popover_container .o_popover");
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    await click(target, "#close");
    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsNone(target, ".o_popover_manager > div:not(.o_popover_container)");

    pseudoWebClient.destroy();
});

QUnit.test("Render popover with content arg", async function (assert) {
    assert.expect(11);

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    assert.containsOnce(target, ".o_popover_manager");
    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsNone(target, ".o_popover_manager > div:not(.o_popover_container)");

    env.services.popover.add({
        content: "skibidi",
        props: {
            target: "#anchor",
        },
    });
    await nextTick();

    await click(target, "#anchor");
    assert.containsOnce(target, ".o_popover_manager portal");
    assert.containsOnce(target, ".o_popover_container .o_popover");
    assert.strictEqual(
        target.querySelector(".o_popover_container .o_popover").textContent,
        "skibidi"
    );
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    await click(target, "#close");
    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsNone(target, ".o_popover_manager > div:not(.o_popover_container)");

    pseudoWebClient.destroy();
});

QUnit.test("Callback on close", async function (assert) {
    assert.expect(2);

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    env.services.popover.add({
        content: "skibidi",
        onClose() {
            assert.step("close");
        },
        props: {
            target: "#anchor",
        },
    });
    await nextTick();

    await click(target, "#anchor");
    await click(target, "#close");

    assert.verifySteps(["close"]);

    pseudoWebClient.destroy();
});

QUnit.test("Keep popover in manager after close", async function (assert) {
    assert.expect(9);

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    env.services.popover.add({
        content: "skibidi",
        keepOnClose: true,
        props: {
            target: "#anchor",
        },
    });
    await nextTick();

    await click(target, "#anchor");

    assert.containsOnce(target, ".o_popover_manager portal");
    assert.containsOnce(target, ".o_popover_container .o_popover");
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    await click(target, "#close");

    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    await click(target, "#anchor");

    assert.containsOnce(target, ".o_popover_manager portal");
    assert.containsOnce(target, ".o_popover_container .o_popover");
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    pseudoWebClient.destroy();
});

QUnit.test("Remove popover manually", async function (assert) {
    assert.expect(6);

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    env.services.popover.add({
        key: "test",
        content: "skibidi",
        props: {
            target: "#anchor",
            trigger: "none",
        },
    });
    await nextTick();

    assert.containsOnce(target, ".o_popover_manager portal");
    assert.containsOnce(target, ".o_popover_container .o_popover");
    assert.containsOnce(target, ".o_popover_manager > div:not(.o_popover_container)");

    env.services.popover.remove("test");
    await nextTick();

    assert.containsNone(target, ".o_popover_manager portal");
    assert.containsNone(target, ".o_popover_container .o_popover");
    assert.containsNone(target, ".o_popover_manager > div:not(.o_popover_container)");

    pseudoWebClient.destroy();
});

QUnit.test("Check errors", async function (assert) {
    assert.expect(2);

    const pseudoWebClient = await mount(PseudoWebClient, { env, target });

    env.services.popover.add({ key: "test" });
    assert.throws(() => {
        env.services.popover.add({ key: "test" });
    }, KeyAlreadyExistsError);

    env.services.popover.remove("test");
    assert.throws(() => {
        env.services.popover.remove("test");
    }, KeyNotFoundError);

    pseudoWebClient.destroy();
});
