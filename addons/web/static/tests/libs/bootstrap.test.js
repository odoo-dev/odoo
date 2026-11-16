import { afterEach, describe, expect, getFixture, test } from "@odoo/hoot";
import { advanceTime } from "@odoo/hoot-mock";

function makeModalEl() {
    const el = Object.assign(document.createElement("div"), {
        // Without `fade`, Modal transitions are synchronous.
        className: "modal fade",
        innerHTML: `<div class="modal-dialog"><div class="modal-content"><div class="modal-body"></div></div></div>`,
    });
    getFixture().append(el);
    return el;
}

describe("web/static/src/libs/bootstrap.js", () => {
    afterEach(() => {
        // A disposed component never releases the body: clean it up so that
        // it does not leak into other tests.
        document.body.classList.remove("modal-open");
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("padding-right");
        document
            .querySelectorAll(".modal-backdrop, .offcanvas-backdrop")
            .forEach((el) => el.remove());
    });

    test("a Modal's queued hide callback does not crash once the Modal is disposed (regression)", async () => {
        // Regression test for a runbot crash: website_slides' course review
        // tour posts/edits/deletes several reviews. Each cycle replaces the
        // whole modal subtree with a fresh element and disposes the
        // previous Modal instance. If an earlier cycle's own queued
        // "hide" fallback timer hadn't fired yet, it used to fire later
        // against the disposed instance:
        //   TypeError: Cannot read properties of null (reading 'ownerDocument')
        //       at Modal._resetAdjustments (...)
        const el = makeModalEl();
        const modal = new window.Modal(el);

        modal.show();
        await advanceTime(1000);

        modal.hide();
        el.remove();
        modal.dispose();

        await advanceTime(1000);
        expect(modal._element).toBe(null);
    });

    test("a Modal's queued show callback does not crash once the Modal is disposed during its backdrop transition", async () => {
        const el = makeModalEl();
        const modal = new window.Modal(el);

        // The backdrop (animated, as the modal has `fade`) queues
        // `_showElement` until its own transition ends.
        modal.show();
        modal.dispose();

        await advanceTime(1000);
        expect(document.querySelector(".modal-backdrop")).toBe(null);
    });

    test("a Modal hidden then removed before its transition ends still releases the body", async () => {
        const el = makeModalEl();
        const modal = new window.Modal(el, { backdrop: false });

        modal.show();
        await advanceTime(1000);
        expect(document.body).toHaveClass("modal-open");

        modal.hide();
        el.remove();

        await advanceTime(1000);
        expect(document.body).not.toHaveClass("modal-open");
        modal.dispose();
    });

    test("an Offcanvas hidden then removed before its transition ends still releases the body", async () => {
        const el = Object.assign(document.createElement("div"), {
            className: "offcanvas offcanvas-start",
        });
        getFixture().append(el);
        const offcanvas = new window.Offcanvas(el, { backdrop: false });

        offcanvas.show();
        await advanceTime(1000);
        expect(document.body.style.overflow).toBe("hidden");

        offcanvas.hide();
        el.remove();

        await advanceTime(1000);
        expect(document.body.style.overflow).toBe("");
        offcanvas.dispose();
    });
});
