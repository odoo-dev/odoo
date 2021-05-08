/** @odoo-module **/

import { useBus } from "@web/core/bus_hook";
import { useService } from "@web/core/service_hook";
import { registry } from "@web/core/registry";
import { makeTestEnv } from "../helpers/mock_env";
import { getFixture, nextTick } from "../helpers/utils";

const { Component, mount, tags } = owl;
const serviceRegistry = registry.category("services");

QUnit.module("hooks");

QUnit.test("useBus", async function (assert) {
    // The callback should only get called once.
    class MyComponent extends Component {
        setup() {
            useBus(this.env.bus, "test-event", this.myCallback);
        }
        myCallback() {
            assert.ok(true);
        }
    }
    MyComponent.template = tags.xml`<div/>`;

    const env = await makeTestEnv();
    const target = getFixture();
    const comp = await mount(MyComponent, { env, target });
    env.bus.trigger("test-event");
    await nextTick();

    comp.unmount();
    env.bus.trigger("test-event");
    await nextTick();
    comp.destroy();
});

QUnit.test("useService: unavailable service", async function (assert) {
    class MyComponent extends Component {
        setup() {
            useService("toy_service");
        }
    }
    MyComponent.template = tags.xml`<div/>`;

    const env = await makeTestEnv();
    const target = getFixture();
    try {
        const comp = await mount(MyComponent, { env, target });
    } catch (e) {
        assert.strictEqual(e.message, "Service toy_service is not available");
    }
});

QUnit.test("useService: service that returns null", async function (assert) {
    class MyComponent extends Component {
        setup() {
            this.toyService = useService("toy_service");
        }
    }
    MyComponent.template = tags.xml`<div/>`;

    serviceRegistry.add("toy_service", {
        name: "toy_service",
        start: () => {
            return null;
        },
    });

    const env = await makeTestEnv();
    const target = getFixture();

    const comp = await mount(MyComponent, { env, target });
    assert.strictEqual(comp.toyService, null);
    comp.unmount();
});
