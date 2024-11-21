import { expect, test } from "@odoo/hoot";

import {
    startInteractions,
    setupInteractionWhiteList,
} from "../core/helpers";

setupInteractionWhiteList("website.text_highlight");

test("text_highlight activate when there is a #wrapwrap", async () => {
    const { core } = await startInteractions(``);
    expect(core.interactions.length).toBe(1);
});
