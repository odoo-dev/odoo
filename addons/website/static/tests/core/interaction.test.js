import { describe, expect, test } from "@odoo/hoot";

import { animationFrame, click, dblclick } from "@odoo/hoot-dom";
import { Deferred } from "@odoo/hoot-mock";
import { Interaction } from "@website/core/interaction";
import { startInteraction } from "./helpers";

describe("event handling", () => {
    test("can add a listener on a single element", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        const { el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(false);
        await click(el.querySelector("span"));
        expect(clicked).toBe(true);
    });

    test("can add a listener on root element", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_root:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        const { el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(false);
        await click(el.querySelector(".test"));
        expect(clicked).toBe(true);
    });

    test("can add a listener on body element", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_body:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(false);
        await click(document.body);
        expect(clicked).toBe(true);
    });

    test("can add a listener on window element", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_window:t-on-someevent": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(false);
        window.dispatchEvent(new Event("someevent"));
        expect(clicked).toBe(true);
    });

    test("can add a listener on document ", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_document:t-on-someevent": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(false);
        window.document.dispatchEvent(new Event("someevent"));
        expect(clicked).toBe(true);
    });

    test("can add a listener on modal element, if any", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_modal:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        await startInteraction(
            Test,
            `
            <div class="modal">
                <div class="test">
                    <span>coucou</span>
                </div>
            </div>`,
        );
        expect(clicked).toBe(false);
        await click(document.querySelector(".modal"));
        expect(clicked).toBe(true);
    });

    test("does not crash if no modal is found", async () => {
        let clicked = false;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "_modal:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked = true;
            }
        }

        await startInteraction(
            Test,
            `
                <div class="test">
                    <span>coucou</span>
                </div>`,
        );
        expect(clicked).toBe(false);
    });


    test("can add a listener on a multiple elements", async () => {
        let clicked = 0;
        class Test extends Interaction {
            static selector = ".test";

            dynamicContent = {
                "span:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked++;
            }
        }

        const { el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou1</span>
            <span>coucou2</span>
        </div>`,
        );
        expect(clicked).toBe(0);
        for (let span of el.querySelectorAll("span")) {
            await click(span);
        }
        expect(clicked).toBe(2);
    });

    test.tags("desktop")("can add multiple listeners on a element", async () => {
        let clicked = 0;
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-on-click": this.doSomething,
                "span:t-on-dblclick": this.doSomething,
            };
            doSomething() {
                clicked++;
            }
        }

        const { el } = await startInteraction(
            Test,
            `
            <div class="test">
                <span>coucou</span>
            </div>`,
        );
        expect(clicked).toBe(0);
        const span = el.querySelector("span");
        await dblclick(span);
        // dblclick = 2 clicks and 1 dblcli
        expect(clicked).toBe(3);
    });

    test("listener is cleaned up when interaction is stopped", async () => {
        let clicked = 0;
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-on-click": this.doSomething,
            };
            doSomething() {
                clicked++;
            }
        }

        const { el, core } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(0);
        await click(el.querySelector("span"));
        expect(clicked).toBe(1);
        core.stopInteractions();
        await click(el.querySelector("span"));
        expect(clicked).toBe(1);
    });

    test("listener added with addListener is cleaned up", async () => {
        let clicked = 0;
        class Test extends Interaction {
            static selector = ".test";

            setup() {
                this.addListener("span", "click", this.doSomething);
            }
            doSomething() {
                clicked++;
            }
        }

        const { el, core } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        expect(clicked).toBe(0);
        await click(el.querySelector("span"));
        expect(clicked).toBe(1);
        core.stopInteractions();
        await click(el.querySelector("span"));
        expect(clicked).toBe(1);
    });

    test("listener is added between willstart and start", async () => {
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-on-click": this.onClick,
            };
            setup() {
                expect.step("setup");
            }
            async willStart() {
                await click(this.el.querySelector("span"));
                expect.step("willStart");
            }
            start() {
                expect.step("start");
            }
            onClick() {
                expect.step("click");
            }
        }

        const { el } = await startInteraction(
            Test,
            `
            <div class="test">
                <span>coucou</span>
            </div>`,
        );
        await click(el.querySelector("span"));

        expect.verifySteps(["setup", "willStart", "start", "click"]);
    });

    test("dom is updated after event is dispatched", async () => {
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-on-click": this.doSomething,
                "span:t-att-data-count": () => this.n,
            };

            setup() {
                this.n = 1;
            }

            doSomething() {
                this.n++;
            }
        }

        const { el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        const span = el.querySelector("span");
        expect(span.dataset.count).toBe("1");
        await click(span);
        expect(span.dataset.count).toBe("2");
        await animationFrame();
        expect(span.dataset.count).toBe("2");
    });
});

describe("t-out", () => {
    test("can do a simple t-out", async () => {
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:t-out": () => "colibri",
            };
        }

        const { el } = await startInteraction(
            Test,
            `<div class="test"><span>coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(`<span>colibri</span>`);
    });
});

describe("lifecycle", () => {
    test("lifecycle methods are called in order", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                expect.step("setup");
            }
            willStart() {
                expect.step("willStart");
            }
            start() {
                expect.step("start");
            }
            destroy() {
                expect.step("destroy");
            }
        }

        const { el, core } = await startInteraction(
            Test,
            `
            <div class="test">
                <span>coucou</span>
            </div>`,
        );

        expect.verifySteps(["setup", "willStart", "start"]);
        core.stopInteractions();
        expect.verifySteps(["destroy"]);
    });

    test("willstart delayed, then destroy => start should not be called", async () => {
        const def = new Deferred();

        class Test extends Interaction {
            static selector = ".test";
            setup() {
                expect.step("setup");
            }
            async willStart() {
                expect.step("willStart");
                return def;
            }
            start() {
                expect.step("start");
            }
            destroy() {
                expect.step("destroy");
            }
        }

        const { core } = await startInteraction(
            Test,
            `
            <div class="test">
                <span>coucou</span>
            </div>`,
            {
                waitForStart: false,
            },
        );
        expect.verifySteps(["setup", "willStart"]);
        // destroy the interaction
        core.stopInteractions();
        expect.verifySteps(["destroy"]);
        def.resolve();
        await animationFrame();
        expect.verifySteps([]);
    });

    test("willstart delayed => update => willstart complete", async () => {
        const def = new Deferred();
        let interaction;

        class Test extends Interaction {
            static selector = ".test";
            setup() {
                interaction = this;
            }
            async willStart() {
                expect.step("willStart");
                return def;
            }
            start() {
                expect.step("start");
            }
        }

        const { core } = await startInteraction(
            Test,
            `
            <div class="test">
                <span>coucou</span>
            </div>`,
            {
                waitForStart: false,
            },
        );
        expect.verifySteps(["willStart"]);
        // trigger an update
        interaction.updateContent();

        await animationFrame();
        expect.verifySteps([]);
        def.resolve();
        await animationFrame();
        expect.verifySteps(["start"]);
    });
});

describe("miscellaneous", () => {
    test("crashes if a dynamic content element does not start with t-", async () => {
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "span:click": this.doSomething,
            };
            doSomething() {}
        }

        let error = null;
        try {
            await startInteraction(Test, `<div class="test"></div>`);
        } catch (e) {
            error = e;
        }
        expect(error).not.toBe(null);
        expect(error.message).toBe(
            "Invalid directive: 'click' (should start with t-)",
        );
    });

    test("crash if dynamicContent is defined on class, not on instance", async () => {

        class Test extends Interaction {
            static selector = ".test";
            static dynamicContent = {}
        }

        let error = null;
        try {
            await startInteraction(Test, `<div class="test"></div>`);
        } catch (e) {
            error = e;
        }
        expect(error).not.toBe(null);
        expect(error.message).toBe(
            "The dynamic content object should be defined on the instance, not on the class (Test)",
        );
    });

    test("can register a cleanup", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                this.registerCleanup(() => {
                    expect.step("cleanup");
                });
            }
            destroy() {
                expect.step("destroy");
            }
        }
        const { core } = await startInteraction(
            Test,
            `<div class="test"></div>`,
        );

        expect.verifySteps([]);
        core.stopInteractions();
        expect.verifySteps(["cleanup", "destroy"]);
    });

    test("cleanups are executed in reverse order", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                this.registerCleanup(() => {
                    expect.step("cleanup1");
                });
                this.registerCleanup(() => {
                    expect.step("cleanup2");
                });
            }
        }
        const { core } = await startInteraction(
            Test,
            `<div class="test"></div>`,
        );

        expect.verifySteps([]);
        core.stopInteractions();
        expect.verifySteps(["cleanup2", "cleanup1"]);
    });
});

describe("dynamic attributes", () => {
    test("can set an attribute", async () => {
        class Test extends Interaction {
            static selector = ".test";
            dynamicContent = {
                "_root:t-att-a": () => "b",
            };
        }

        const { el, core } = await startInteraction(
            Test,
            `<div class="test"><span>coucou</span></div>`,
        );
        expect(el.querySelector(".test").outerHTML).toBe(
            `<div class="test" a="b"><span>coucou</span></div>`,
        );
        core.stopInteractions();
        expect(el.querySelector(".test").outerHTML).toBe(
            `<div class="test"><span>coucou</span></div>`,
        );

    });

    test("t-att-class does not override existing classes", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => ({ b: true }),
            };
        }

        const { el } = await startInteraction(
            Test,
            `<div><span class="a">coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="a b">coucou</span>`,
        );
    });

    test("t-att-class, basic test", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => ({ a: true, b: this.val }),
            };

            setup() {
                this.val = true;
            }
        }

        const { el } = await startInteraction(
            Test,
            `<div><span>coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="a b">coucou</span>`,
        );
    });

    test("t-att-class can remove a class", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => ({ a: false }),
            };
        }

        const { el } = await startInteraction(
            Test,
            `<div><span class="a">coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="">coucou</span>`,
        );
    });

    test("t-att- can remove an attribute with undefined", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-a": () => undefined,
            };
        }

        const { el } = await startInteraction(
            Test,
            `<span a="b">coucou</span>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span>coucou</span>`,
        );
    });

    test("t-att-class can add multiple classes", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => ({"b c": true}),
            };
        }

        const { el } = await startInteraction(
            Test,
            `<div><span class="a">coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="a b c">coucou</span>`,
        );
    });

    test("t-att-class can add and remove a class", async () => {
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => ({a: this.flag, b: !this.flag}),
                "_root:t-on-click": this.toggle,
            };
            setup() {
                this.flag = true;
            }
            toggle() {
                this.flag = !this.flag;
            }
        }

        const { el } = await startInteraction(
            Test,
            `<div><span class="bla">coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="bla a">coucou</span>`,
        );
        await click(el.querySelector("span"));
        await animationFrame();
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="bla b">coucou</span>`,
        );
    });

    test("t-att- receive the target as argument", async () => {
        let target;
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-a": (_el) => { target = _el; return "b";},
            };
        }

        const { el } = await startInteraction(
            Test,
            `<div><span>coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span a="b">coucou</span>`,
        );
        expect(target).toBe(el.querySelector("span"));

    });

    test("t-att-class, another scenario", async () => {
        const c = [{a: true}, {b: true}];
        let interaction;
        class Test extends Interaction {
            static selector = "span";
            dynamicContent = {
                "_root:t-att-class": () => c.pop(),
            };
            setup() {
                interaction = this;
            }
        }

        const { el } = await startInteraction(
            Test,
            `<div><span>coucou</span></div>`,
        );
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="b">coucou</span>`,
        );
        interaction.updateContent();
        await animationFrame();
        expect(el.querySelector("span").outerHTML).toBe(
            `<span class="b a">coucou</span>`,
        );

    });

});

describe("insert", () => {
    test("can insert an element", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                const el = document.createElement("inserted");
                this.insert(el);
            }
        }

        const { core, el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>coucou</span>
        </div>`,
        );
        const testEl = el.querySelector(".test");
        let insertedEl = testEl.querySelector("inserted");
        expect(insertedEl).not.toBe(null);
        expect(insertedEl).toBe(testEl.lastElementChild);
        core.stopInteractions();
        insertedEl = el.querySelector("inserted");
        expect(insertedEl).toBe(null);
    });

    test("can insert an element before another one", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                const spanEls = this.el.querySelectorAll("span");
                const el = document.createElement("inserted");
                this.insert(el, spanEls[1], "beforebegin");
            }
        }
    
        const { core, el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>first</span>
            <span>last</span>
        </div>`,
        );
        const testEl = el.querySelector(".test");
        let insertedEl = testEl.querySelector("inserted");
        expect(insertedEl).not.toBe(null);
        expect(insertedEl).toBe(testEl.children[1]);
        core.stopInteractions();
        insertedEl = el.querySelector("inserted");
        expect(insertedEl).toBe(null);
    });

    test("can insert an element after another one", async () => {
        class Test extends Interaction {
            static selector = ".test";
            setup() {
                const spanEls = this.el.querySelectorAll("span");
                const el = document.createElement("inserted");
                this.insert(el, spanEls[0], "afterend");
            }
        }

        const { core, el } = await startInteraction(
            Test,
            `
        <div class="test">
            <span>first</span>
            <span>last</span>
        </div>`,
        );
        const testEl = el.querySelector(".test");
        let insertedEl = testEl.querySelector("inserted");
        expect(insertedEl).not.toBe(null);
        expect(insertedEl).toBe(testEl.children[1]);
        core.stopInteractions();
        insertedEl = el.querySelector("inserted");
        expect(insertedEl).toBe(null);
    });
});
