import { expect, test } from "@odoo/hoot";
import { click, queryOne, runAllTimers, waitFor, waitUntil } from "@odoo/hoot-dom";
import { defineBusModels, waitForChannels } from "@bus/../tests/bus_test_helpers";
import {
    contains,
    defineModels,
    fields,
    models,
    mockService,
    mountView,
    MockServer,
    serverState,
} from "@web/../tests/web_test_helpers";

class WatchedRecord extends models.Model {
    _name = "bus.test.watched.record";
    name = fields.Char();
    _records = [{ id: 1, name: "Jerry" }];
}

defineBusModels();
defineModels([WatchedRecord]);

const WATCHED_FORM_ARCH = `<form><field name="name"/></form>`;

/**
 * `lazy_session_info` is only fetched once the real WebClient has fired WEB_CLIENT_READY
 * (see session_service.js), which never happens when mounting a bare view in tests. Mock
 * the service directly so these tests exercise the FormController patch in isolation.
 */
function mockLazySession(formWatchableModels) {
    mockService("lazy_session", () => ({
        async getValue(key, callback) {
            callback({ form_watchable_models: formWatchableModels }[key]);
        },
    }));
}

test("form view waits for lazy session info before deciding whether to watch the record", async () => {
    const { promise: lazySessionPromise, resolve: resolveLazySession } = Promise.withResolvers();
    mockService("lazy_session", () => ({
        async getValue(key, callback) {
            await lazySessionPromise;
            callback({ form_watchable_models: ["bus.test.watched.record"] }[key]);
        },
    }));

    let mounted = false;
    const mountPromise = mountView({
        type: "form",
        resModel: "bus.test.watched.record",
        resId: 1,
        arch: WATCHED_FORM_ARCH,
    }).then(() => {
        mounted = true;
    });

    // The lazy session callback hasn't fired yet: the form must not finish mounting in the
    // meantime, otherwise `onMounted` would run against an empty `watchableModels` set and
    // this record would silently never be watched (and never re-checked afterwards).
    await runAllTimers();
    expect(mounted).toBe(false);

    resolveLazySession();
    await mountPromise;
    expect(mounted).toBe(true);

    await waitForChannels(["web.form_watch:bus.test.watched.record:1"]);
});

test("form view does not watch a record whose model is not in form_watchable_models", async () => {
    mockLazySession([]);

    await mountView({
        type: "form",
        resModel: "bus.test.watched.record",
        resId: 1,
        arch: WATCHED_FORM_ARCH,
    });
    await runAllTimers();

    await waitForChannels(["web.form_watch:bus.test.watched.record:1"], { operation: "delete" });
});

function notifyRecordUpdated() {
    MockServer.env["bus.test.watched.record"].write(1, { name: "Updated by cron" });
    MockServer.env["bus.bus"]._sendone(
        "web.form_watch:bus.test.watched.record:1",
        "web.form_record_updated",
        { uid: serverState.userId + 1, resModel: "bus.test.watched.record", resId: 1 }
    );
}

test("form data is reloaded when the watched record is updated and the form is not dirty", async () => {
    mockLazySession(["bus.test.watched.record"]);
    await mountView({
        type: "form",
        resModel: "bus.test.watched.record",
        resId: 1,
        arch: WATCHED_FORM_ARCH,
    });
    await waitForChannels(["web.form_watch:bus.test.watched.record:1"]);

    notifyRecordUpdated();
    // `onUpdated` is an unawaited event listener (see bus_service.js): nothing in the
    // framework blocks on its `await isDirty()` chain, so poll for the actual outcome
    // instead of assuming a fixed number of ticks is enough.
    await waitUntil(() => queryOne(".o_field_widget[name=name] input").value === "Updated by cron");

    expect(".o_notification").toHaveCount(0);
});

test("dirty form shows a warning instead of reloading when the watched record is updated", async () => {
    mockLazySession(["bus.test.watched.record"]);
    await mountView({
        type: "form",
        resModel: "bus.test.watched.record",
        resId: 1,
        arch: WATCHED_FORM_ARCH,
    });
    await waitForChannels(["web.form_watch:bus.test.watched.record:1"]);
    await contains(".o_field_widget[name=name] input").edit("Local unsaved edit");

    notifyRecordUpdated();
    await waitFor(".o_notification");

    // The local edit must survive: reloading now would silently drop it.
    expect(".o_field_widget[name=name] input").toHaveValue("Local unsaved edit");
    expect(".o_notification").toHaveCount(1);
    expect(".o_notification_content").toHaveText("This record has been modified by another user.");
});

test("clicking Reload on the warning discards the local edit and loads the new data", async () => {
    mockLazySession(["bus.test.watched.record"]);
    await mountView({
        type: "form",
        resModel: "bus.test.watched.record",
        resId: 1,
        arch: WATCHED_FORM_ARCH,
    });
    await waitForChannels(["web.form_watch:bus.test.watched.record:1"]);
    await contains(".o_field_widget[name=name] input").edit("Local unsaved edit");

    notifyRecordUpdated();
    await waitFor(".o_notification");

    await click(".o_notification_buttons button:contains(Reload)");
    await waitUntil(() => queryOne(".o_field_widget[name=name] input").value === "Updated by cron");

    expect(".o_notification").toHaveCount(0);
});
