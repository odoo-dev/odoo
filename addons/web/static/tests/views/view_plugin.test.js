import { after, describe, expect, test } from "@odoo/hoot";
import {
    defineModels,
    getService,
    makeTestApp,
    models,
    onRpc,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";

import { browser } from "@web/core/browser/browser";
import { rpcBus } from "@web/core/network/rpc";
import { session } from "@web/session";
import { ViewPlugin } from "@web/views/view_plugin";

describe.current.tags("headless");

class TakeFive extends models.Model {
    _name = "take.five";
    _views = {
        "list,99": /* xml */ `<list><field name="display_name" /></list>`,
    };
}

class IrUiView extends models.Model {
    _name = "ir.ui.view";
}

defineModels([TakeFive, IrUiView]);

test("stores calls in cache in success", async () => {
    expect.assertions(1);
    onRpc("get_views", () => {
        expect.step("get_views");
    });
    await makeTestApp();
    await getService(ViewPlugin).loadViews(
        {
            resModel: "take.five",
            views: [[99, "list"]],
            context: { default_field_value: 1 },
        },
        {}
    );
    await getService(ViewPlugin).loadViews(
        {
            resModel: "take.five",
            views: [[99, "list"]],
            context: { default_field_value: 2 },
        },
        {}
    );
    expect.verifySteps(["get_views"]);
});

test("stores calls in cache when failed", async () => {
    expect.assertions(3);
    onRpc("get_views", () => {
        expect.step("get_views");
        throw new Error("my little error");
    });
    await makeTestApp();
    await expect(
        getService(ViewPlugin).loadViews(
            {
                resModel: "take.five",
                views: [[99, "list"]],
            },
            {}
        )
    ).rejects.toThrow(/my little error/);
    await expect(
        getService(ViewPlugin).loadViews(
            {
                resModel: "take.five",
                views: [[99, "list"]],
            },
            {}
        )
    ).rejects.toThrow(/my little error/);
    expect.verifySteps(["get_views", "get_views"]);
});

test("clear cache when updating ir.ui.view", async () => {
    expect.assertions(4);
    onRpc("get_views", () => {
        expect.step("get_views");
    });
    await makeTestApp();
    const loadView = () =>
        getService(ViewPlugin).loadViews(
            {
                resModel: "take.five",
                views: [[99, "list"]],
                context: { default_field_value: 1 },
            },
            {}
        );
    await loadView();
    expect.verifySteps(["get_views"]);
    await loadView();
    expect.verifySteps([]); // cache works => no actual rpc
    await getService("orm").unlink("ir.ui.view", [3]);
    await loadView();
    expect.verifySteps(["get_views"]); // cache was invalidated
    await getService("orm").unlink("take.five", [3]);
    await loadView();
    expect.verifySteps([]); // cache was not invalidated
});

test("clear cache when the views hash changed", async () => {
    patchWithCleanup(session, { views_hash: "new hash" });
    browser.localStorage.setItem("views_hash", "old hash");
    const listener = (ev) => expect.step(`CLEAR-CACHES ${ev.detail}`);
    rpcBus.addEventListener("CLEAR-CACHES", listener);
    after(() => rpcBus.removeEventListener("CLEAR-CACHES", listener));

    await makeTestApp();
    expect.verifySteps(["CLEAR-CACHES get_views"]);
    expect(browser.localStorage.getItem("views_hash")).toBe("new hash");
});

test("don't clear cache when the views hash is unchanged", async () => {
    patchWithCleanup(session, { views_hash: "same hash" });
    browser.localStorage.setItem("views_hash", "same hash");
    const listener = (ev) => expect.step(`CLEAR-CACHES ${ev.detail}`);
    rpcBus.addEventListener("CLEAR-CACHES", listener);
    after(() => rpcBus.removeEventListener("CLEAR-CACHES", listener));

    await makeTestApp();
    expect.verifySteps([]);
});
