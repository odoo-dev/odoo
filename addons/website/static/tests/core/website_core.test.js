import { expect, test } from "@odoo/hoot";
import { animationFrame } from "@odoo/hoot-mock";

import { Interaction } from "@website/core/interaction";
import { startInteraction } from "./helpers";
import { Component, xml } from "@odoo/owl";

test("wait for translation before starting interactions", async () => {
    let flag = false;

    class Test extends Interaction {
        static selector = ".test";

        setup() {
            flag = true;
            expect("localization" in this.services).toBe(true);
        }
    }
    await startInteraction(Test, `<div class="test"></div>`);
});

test("starting interactions twice should only actually do it once", async () => {
    let n = 0;
    class Test extends Interaction {
        static selector = ".test";

        setup() {
            n++;
        }
    }

    const { core } = await startInteraction(Test, `<div class="test"></div>`);

    expect(n).toBe(1);
    core.startInteractions();
    await animationFrame();
    expect(n).toBe(1);
});


test("can mount a component", async () => {
    class Test extends Component {
        static selector = ".test";
        static template = xml`owl component`;
    }
    const {el} = await startInteraction(Test, `<div class="test"></div>`);
    expect(el.querySelector(".test").innerHTML).toBe(`<owl-component contenteditable="false" data-oe-protected="true">owl component</owl-component>`);
});