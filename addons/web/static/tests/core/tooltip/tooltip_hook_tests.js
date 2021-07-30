/** @odoo-module **/

import { browser } from "@web/core/browser/browser";
import { PopoverContainer } from "@web/core/popover/popover_container";
import { popoverService } from "@web/core/popover/popover_service";
import { useTooltip } from "@web/core/tooltip/tooltip_hook";
import { registry } from "@web/core/registry";
import { registerCleanup } from "../../helpers/cleanup";
import { clearRegistryWithCleanup, makeTestEnv } from "../../helpers/mock_env";
import { getFixture, nextTick, patchWithCleanup, triggerEvent } from "../../helpers/utils";

const { Component, mount, useState } = owl;
const { xml } = owl.tags;

const mainComponents = registry.category("main_components");

/**
 * Creates and mounts a parent component that use the "useTooltip" hook.
 *
 * @param {Component} Child a child Component that contains nodes with "data-tooltip" attribute
 * @param {Object} [options]
 * @param {Object} options.mockSetTimeout the mocked setTimeout to use (by default, calls the
 *   callback directly)
 * @returns {Promise<Component>}
 */
async function makeParent(Child, options = {}) {
    const fixture = getFixture();

    // add the popover service to the registry -> will add the PopoverContainer
    // to the mainComponentRegistry
    clearRegistryWithCleanup(mainComponents);
    registry.category("services").add("popover", popoverService);
    const env = await makeTestEnv();

    class Parent extends Component {
        setup() {
            this.Components = mainComponents.getEntries();
            useTooltip();
        }
    }
    Parent.template = xml`
        <div>
            <Child/>
            <div>
                <t t-foreach="Components" t-as="Component" t-key="Component[0]">
                    <t t-component="Component[1].Component" t-props="Component[1].props"/>
                </t>
            </div>
        </div>`;
    Parent.components = { PopoverContainer, Child };

    patchWithCleanup(browser, {
        setTimeout: options.mockSetTimeout || ((fn) => fn()),
        setInterval: options.mockSetInterval || ((fn) => fn()),
    });

    const comp = await mount(Parent, { env, target: fixture });
    registerCleanup(() => comp.destroy());
    return comp;
}

QUnit.module("Tooltip hook", () => {
    QUnit.test("basic rendering", async (assert) => {
        class MyComponent extends Component {}
        MyComponent.template = xml`<button data-tooltip="hello">Action</button>`;
        let simulateTimeout;
        const mockSetTimeout = (fn) => {
            simulateTimeout = fn;
        };
        let simulateInterval;
        const mockSetInterval = (fn) => {
            simulateInterval = fn;
        };
        const parent = await makeParent(MyComponent, { mockSetTimeout, mockSetInterval });

        assert.containsNone(parent, ".o_popover_container .o_popover");
        parent.el.querySelector("button").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsNone(parent, ".o_popover_container .o_popover");

        simulateTimeout();
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(
            parent.el.querySelector(".o_popover_container .o_popover").innerText,
            "hello"
        );

        const buttonRect = parent.el.querySelector("button").getBoundingClientRect();
        const x = buttonRect.right + 10;
        const y = buttonRect.bottom + 10;
        await triggerEvent(parent.el, "button", "mousemove", {
            pageX: x,
            layerX: x,
            screenX: x,
            pageY: y,
            layerY: y,
            screenY: y,
        });
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        simulateInterval();
        await nextTick();
        assert.containsNone(parent, ".o_popover_container .o_popover");
    });

    QUnit.test("remove element with opened tooltip", async (assert) => {
        let compState;
        class MyComponent extends Component {
            setup() {
                this.state = useState({ visible: true });
                compState = this.state;
            }
        }
        MyComponent.template = xml`
            <div>
                <button t-if="state.visible" data-tooltip="hello">Action</button>
            </div>`;
        let simulateInterval;
        const mockSetInterval = (fn) => {
            simulateInterval = fn;
        };
        const parent = await makeParent(MyComponent, { mockSetInterval });

        assert.containsOnce(parent, "button");
        assert.containsNone(parent, ".o_popover_container .o_popover");
        parent.el.querySelector("button").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");

        compState.visible = false;
        await nextTick();
        assert.containsNone(parent, "button");
        simulateInterval();
        await nextTick();
        assert.containsNone(parent, ".o_popover_container .o_popover");
    });

    QUnit.test("rendering with several tooltips", async (assert) => {
        class MyComponent extends Component {}
        MyComponent.template = xml`
            <div>
                <button class="button_1" data-tooltip="tooltip 1">Action 1</button>
                <button class="button_2" data-tooltip="tooltip 2">Action 2</button>
            </div>`;
        const parent = await makeParent(MyComponent);

        assert.containsNone(parent, ".o_popover_container .o_popover");
        parent.el.querySelector("button.button_1").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "tooltip 1");
        parent.el.querySelector("button.button_1").dispatchEvent(new Event("mouseleave"));
        parent.el.querySelector("button.button_2").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "tooltip 2");
    });

    QUnit.test("positionning", async (assert) => {
        class MyComponent extends Component {}
        MyComponent.template = xml`
            <div style="height: 400px; padding: 40px">
                <button class="default" data-tooltip="default">Default</button>
                <button class="top" data-tooltip="top" data-tooltip-position="top">Top</button>
                <button class="right" data-tooltip="right" data-tooltip-position="right">Right</button>
                <button class="bottom" data-tooltip="bottom" data-tooltip-position="bottom">Bottom</button>
                <button class="left" data-tooltip="left" data-tooltip-position="left">Left</button>
            </div>`;
        const parent = await makeParent(MyComponent);

        // default
        parent.el.querySelector("button.default").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "default");
        assert.hasClass(parent.el.querySelector(".o_popover"), "o_popover_bottom");

        // top
        parent.el.querySelector("button.top").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "top");
        assert.hasClass(parent.el.querySelector(".o_popover"), "o_popover_top");

        // right
        parent.el.querySelector("button.right").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "right");
        assert.hasClass(parent.el.querySelector(".o_popover"), "o_popover_right");

        // bottom
        parent.el.querySelector("button.bottom").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "bottom");
        assert.hasClass(parent.el.querySelector(".o_popover"), "o_popover_bottom");

        // left
        parent.el.querySelector("button.left").dispatchEvent(new Event("mouseenter"));
        await nextTick();
        assert.containsOnce(parent, ".o_popover_container .o_popover");
        assert.strictEqual(parent.el.querySelector(".o_popover").innerText, "left");
        assert.hasClass(parent.el.querySelector(".o_popover"), "o_popover_left");
    });
});
