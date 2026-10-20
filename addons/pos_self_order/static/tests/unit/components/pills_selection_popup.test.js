import { test, expect, mockDate } from "@odoo/hoot";
import { contains, mountWithCleanup } from "@web/../tests/web_test_helpers";
import { PillsSelectionPopup } from "@pos_self_order/app/components/pills_selection_popup/pills_selection_popup";
import { setupSelfPosEnv } from "../utils";
import { definePosSelfModels } from "../data/generate_model_definitions";

definePosSelfModels();

const { DateTime } = luxon;

test("PillsSelectionPopup", async () => {
    mockDate("2026-05-15 12:00:00");
    const store = await setupSelfPosEnv();
    const preset = store.models["pos.preset"].get(2);
    store.currentOrder.preset_id = preset;

    await mountWithCleanup(PillsSelectionPopup, {
        props: {
            options: store.getTimingOptions(preset),
            title: "Select Time",
            subtitle: "Choose when to receive your order",
            close: () => {},
            getPayload: () => {},
            selectionType: "time",
        },
    });

    const buttons = [...document.querySelectorAll(".preset_date_buttons")];
    const result = buttons.map((btn) => ({
        label: btn.querySelector("span")?.textContent?.trim(),
        date: btn.querySelector("small")?.textContent?.trim() || null,
    }));

    expect(result).toEqual([
        { label: "Today", date: null },
        { label: "Tomorrow", date: null },
        { label: "Tuesday", date: "May 19" },
        { label: "Wednesday", date: "May 20" },
        { label: "Thursday", date: "May 21" },
    ]);
});

test("PillsSelectionPopup refuses an option that expired while open", async () => {
    mockDate("2026-05-15 11:55:00", 0);
    const store = await setupSelfPosEnv();
    const preset = store.models["pos.preset"].get(2);
    store.currentOrder.preset_id = preset;

    await mountWithCleanup(PillsSelectionPopup, {
        props: {
            options: store.getTimingOptions(preset),
            title: "Select Time",
            subtitle: "Choose when to receive your order",
            close: () => expect.step("close"),
            getPayload: (slot) => expect.step(slot),
            selectionType: "time",
            isOptionValid: (slot) => store.isSlotSelectable(preset, DateTime.fromSQL(slot)),
        },
    });

    // 12:00 is less than one interval (20 min) away, so it can't be prepared in time
    expect(".option-item:first").toHaveText("12:20");

    // 12:20 was offered at 11:55, but is less than one interval away at 12:01
    mockDate("2026-05-15 12:01:00", 0);
    await contains(".option-item:first").click();
    await contains(".btn-primary:contains(Confirm)").click();
    expect.verifySteps([]);
    expect(".option-item:first").toHaveAttribute("disabled");
    expect(".text-danger").toHaveCount(1);

    await contains(".option-item:eq(1)").click();
    await contains(".btn-primary:contains(Confirm)").click();
    expect.verifySteps(["2026-05-15 12:40:00", "close"]);
});
