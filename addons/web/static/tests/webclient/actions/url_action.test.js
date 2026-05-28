import { expect, test, mockLocation } from "@odoo/hoot";
import { getService, makeMockEnv, patchWithCleanup } from "@web/../tests/web_test_helpers";

test("execute an 'ir.actions.act_url' action with target 'self'", async () => {
    patchWithCleanup(mockLocation, {
        assign: (url) => {
            expect.step(url);
        },
    });
    await makeMockEnv();
    await getService("action").doAction({
        type: "ir.actions.act_url",
        target: "self",
        url: "/my/test/url",
    });
    expect.verifySteps(["/my/test/url"]);
});

test("execute an 'ir.actions.act_url' action with onClose option", async () => {
    patchWithCleanup(window, {
        open: () => expect.step("browser open"),
    });
    await makeMockEnv();
    const options = {
        onClose: () => expect.step("onClose"),
    };
    await getService("action").doAction({ type: "ir.actions.act_url" }, options);
    expect.verifySteps(["browser open", "onClose"]);
});

test("execute an 'ir.actions.act_url' action with url javascript:", async () => {
    patchWithCleanup(mockLocation, {
        assign: (url) => {
            expect.step(url);
        },
    });
    await makeMockEnv();
    await getService("action").doAction({
        type: "ir.actions.act_url",
        target: "self",
        url: "javascript:alert()",
    });
    expect.verifySteps(["/javascript:alert()"]);
});

test("execute an 'ir.actions.act_url' action with target 'download'", async () => {
    patchWithCleanup(window, {
        open: (url) => {
            expect.step(url);
        },
    });
    await makeMockEnv();
    await getService("action").doAction({
        type: "ir.actions.act_url",
        target: "download",
        url: "/my/test/url",
    });
    expect(".o_blockUI").toHaveCount(0);
    expect.verifySteps(["/my/test/url"]);
});
