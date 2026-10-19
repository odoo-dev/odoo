import { describe, expect, getFixture, test } from "@odoo/hoot";
import { findTarget } from "@learning/core/dom_target";
import { formSaved, isStepDone, typed, typedChange, TYPING_PAUSE } from "@learning/core/step_conditions";

describe.current.tags("desktop");

function render(html) {
    getFixture().innerHTML = html;
}

describe("findTarget", () => {
    test("finds a visible element, filtered by text", () => {
        render(`
            <button class="b" style="display: none">Duplicate</button>
            <button class="b">Archive</button>
            <button class="b">Duplicate</button>
        `);
        expect(findTarget({ trigger: ".b", text: "duplicate" })).toBe(getFixture().children[2]);
        expect(findTarget({ trigger: ".b", text: "Delete" })).toBe(null);
    });

    test("only looks in the dialog on top", () => {
        render(`
            <button class="b">Page</button>
            <div class="o_dialog"><div class="modal"><button class="b">Dialog</button></div></div>
        `);
        expect(findTarget({ trigger: ".b" }).textContent).toBe("Dialog");
    });
});

describe("isStepDone", () => {
    test("without condition: done when the target was clicked", () => {
        expect(isStepDone({}, { clicked: false })).toBe(false);
        expect(isStepDone({}, { clicked: true })).toBe(true);
    });

    test("selector condition: done when it appears", () => {
        render(`<div class="saved">Saved</div>`);
        expect(isStepDone({ until: ".saved" }, {})).toBe(true);
        expect(isStepDone({ until: { trigger: ".saved", text: "nope" } }, {})).toBe(false);
    });

    test("typed: done once something is typed and the learner paused", () => {
        render(`<input value="Pipes"/>`);
        const target = getFixture().querySelector("input");
        const step = { until: typed() };
        expect(isStepDone(step, { target, idleMs: 100 })).toBe(false);
        expect(isStepDone(step, { target, idleMs: TYPING_PAUSE })).toBe(true);
        target.value = "  ";
        expect(isStepDone(step, { target, idleMs: TYPING_PAUSE })).toBe(false);
    });

    test("formSaved: done once the save button is hidden", () => {
        render(`
            <div class="o_form_status_indicator">
                <div class="o_form_status_indicator_buttons"><button class="o_form_button_save">Save</button></div>
            </div>
        `);
        const step = { until: formSaved() };
        expect(isStepDone(step, {})).toBe(false);
        getFixture().querySelector(".o_form_status_indicator_buttons").style.visibility = "hidden";
        expect(isStepDone(step, {})).toBe(true);
    });

    test("typedChange: also waits for the form to show unsaved changes", () => {
        render(`
            <input value="New name"/>
            <div class="o_form_status_indicator">
                <div class="o_form_status_indicator_buttons" style="visibility: hidden"><button class="o_form_button_save">Save</button></div>
            </div>
        `);
        const target = getFixture().querySelector("input");
        const step = { until: typedChange() };
        expect(isStepDone(step, { target, idleMs: TYPING_PAUSE })).toBe(false);
        getFixture().querySelector(".o_form_status_indicator_buttons").style.visibility = "visible";
        expect(isStepDone(step, { target, idleMs: TYPING_PAUSE })).toBe(true);
    });
});
