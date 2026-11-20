import { describe, expect, test } from "@odoo/hoot";
import { contains, mountWithCleanup } from "@web/../tests/web_test_helpers";
import { TableJoinPopup } from "@pos_self_order/app/components/table_join_popup/table_join_popup";
import { definePosSelfModels } from "../data/generate_model_definitions";
import { setupSelfPosEnv } from "../utils";

definePosSelfModels();

async function mountPopup(mode) {
    await setupSelfPosEnv("mobile", "table", "meal");
    await mountWithCleanup(TableJoinPopup, {
        props: {
            mode,
            tableNumber: 5,
            confirm: () => expect.step("confirm"),
            cancel: () => expect.step("cancel"),
            close: () => expect.step("close"),
        },
    });
}

describe("TableJoinPopup", () => {
    test("join: asks the guest to request access to the table", async () => {
        await mountPopup("join");
        expect(".o_table_join_join .o_table_join_icon [data-icon='lock']").toHaveCount(1);
        expect(".o_table_join_join .badge:contains('Table 5')").toHaveCount(1);
        expect(".o_table_join_join h2").toHaveText("This table is already ordering");
        expect(".o_table_join_step_done").toHaveCount(1);
        expect(".o_table_join_step_active:contains('Request')").toHaveCount(1);

        await contains(".o_table_join_join .btn-primary:contains('Request to Join')").click();
        expect.verifySteps(["close", "confirm"]);
        await contains(".o_table_join_join .btn-secondary:contains('Not now')").click();
        expect.verifySteps(["close", "cancel"]);
    });

    test("waiting: only offers to close the popup", async () => {
        await mountPopup("waiting");
        expect(".o_table_join_waiting h2").toHaveText("Waiting for approval");
        expect(".o_table_join_step_done").toHaveCount(2);
        expect(".o_table_join_step_active [data-icon='hourglass_top']").toHaveCount(1);
        expect(".o_table_join_waiting .btn-primary").toHaveCount(0);

        await contains(".o_table_join_waiting .btn-secondary:contains('Close')").click();
        expect.verifySteps(["close", "cancel"]);
    });

    test("approve: the lead allows or declines the guest", async () => {
        await mountPopup("approve");
        expect(".o_table_join_approve h2").toHaveText("Someone wants to join your table");
        expect(".o_table_join_steps").toHaveCount(0);

        await contains(".o_table_join_approve .btn-primary:contains('Allow')").click();
        expect.verifySteps(["close", "confirm"]);
        await contains(".o_table_join_approve .btn-secondary:contains('Decline')").click();
        expect.verifySteps(["close", "cancel"]);
    });
});
