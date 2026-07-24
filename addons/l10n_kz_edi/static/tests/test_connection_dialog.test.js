import { describe, expect, test } from "@odoo/hoot";
import { queryAllTexts, queryOne, waitUntil } from "@odoo/hoot-dom";
import { animationFrame } from "@odoo/hoot-mock";
import {
    allowTranslations,
    mockService,
    mountWithCleanup,
    patchWithCleanup,
} from "@web/../tests/web_test_helpers";
import { defineMailModels } from "@mail/../tests/mail_test_helpers";

import { L10nKzEdiTestConnection } from "@l10n_kz_edi/js/test_connection_action";

describe.current.tags("headless");

// Mounting builds a full env, whose mail services refuse to start without models.
defineMailModels();

/**
 * Mount the client action with the ORM replaced by `handlers`, and return the
 * component. Mounting does NOT wait for the checks: they run after the first
 * render, which is the whole point.
 *
 * A method missing from `handlers` throws, exactly as a server error would.
 */
async function mountAction(handlers) {
    allowTranslations();
    mockService("orm", {
        call(model, method, args) {
            if (!(method in handlers)) {
                throw new Error(`unexpected call to ${method}`);
            }
            return handlers[method](args);
        },
    });
    return mountWithCleanup(L10nKzEdiTestConnection, {
        props: { action: { params: { company_id: 1 } } },
    });
}

/** Wait until every check has reported, then let OWL repaint. */
async function settled(component) {
    await waitUntil(() => !component.state.running);
    await animationFrame();
}

/** Stub the signing seam; NCALayer itself is covered by ncalayer_signing.test.js. */
function mockNCALayerSuccess() {
    patchWithCleanup(L10nKzEdiTestConnection.prototype, {
        async _signTicket() {
            return "<signedXml/>";
        },
    });
}

const HAPPY_PATH = {
    l10n_kz_edi_check_reachability: () => ({ reachable: true }),
    l10n_kz_edi_create_auth_ticket: () => "<authSign/>",
    l10n_kz_edi_run_signed_checks: () => ({
        summary: "Connected as Acme LLP (BIN 123456789012).",
        enterprise_validation_result: { success: true, message: "Enterprise validated." },
    }),
};

describe("connection test dialog", () => {
    test("lists every check before any of them has finished", async () => {
        // The reported bug: the dialog only appeared once all checks were done.
        let release;
        const gate = new Promise((resolve) => {
            release = resolve;
        });
        mockNCALayerSuccess();
        const component = await mountAction({
            ...HAPPY_PATH,
            l10n_kz_edi_check_reachability: () => gate.then(() => ({ reachable: true })),
        });

        // Mounted and populated while check 1 is still in flight.
        expect(queryAllTexts(".o_l10n_kz_edi_test_connection .fw-bold")).toEqual([
            "Check 1 — Server reachability",
            "Check 2 — Authentication",
            "Check 3 — Enterprise validation",
        ]);
        expect(".fa-circle-o-notch.fa-spin").toHaveCount(1); // check 1 running
        expect(".fa-circle-o").toHaveCount(2); // checks 2 and 3 pending
        expect(".fa-check-circle").toHaveCount(0);

        release();
        await settled(component);
        expect(".fa-check-circle").toHaveCount(3);
    });

    test("greens each check as it completes", async () => {
        mockNCALayerSuccess();
        const component = await mountAction(HAPPY_PATH);
        await settled(component);

        expect(".fa-check-circle").toHaveCount(3);
        expect(".fa-times-circle").toHaveCount(0);
        expect(queryOne(".o_l10n_kz_edi_test_connection").textContent).toInclude(
            "Connected as Acme LLP (BIN 123456789012)."
        );
    });

    test("renders the server's error text instead of hiding it in a notification", async () => {
        // KGD codes are mapped server-side, so they arrive already readable in
        // `data.message` -- the shape a UserError actually takes over call_kw.
        const component = await mountAction({
            l10n_kz_edi_check_reachability: () => {
                const error = new Error("RPC_ERROR");
                error.data = { message: "The ESF server could not reach the NCA." };
                throw error;
            },
        });
        await settled(component);

        const text = queryOne(".o_l10n_kz_edi_test_connection").textContent;
        expect(text).toInclude("Check 1 — Server reachability");
        expect(text).toInclude("The ESF server could not reach the NCA.");
        expect(".fa-times-circle").toHaveCount(1);
    });

    test("falls back to the raw message when the error carries no data", async () => {
        const component = await mountAction({
            l10n_kz_edi_check_reachability: () => {
                throw new Error("Connection refused by the proxy");
            },
        });
        await settled(component);

        expect(queryOne(".o_l10n_kz_edi_test_connection").textContent).toInclude(
            "Connection refused by the proxy"
        );
    });

    test("marks the checks that never ran, rather than leaving them pending", async () => {
        const component = await mountAction({
            l10n_kz_edi_check_reachability: () => {
                throw new Error("boom");
            },
        });
        await settled(component);

        expect(".fa-times-circle").toHaveCount(1); // check 1
        expect(".fa-minus-circle").toHaveCount(2); // checks 2 and 3
        expect(".fa-circle-o-notch").toHaveCount(0); // nothing left spinning
    });

    test("skips nothing when the failure is the last check", async () => {
        mockNCALayerSuccess();
        const component = await mountAction({
            ...HAPPY_PATH,
            l10n_kz_edi_run_signed_checks: () => ({
                summary: "Connected.",
                enterprise_validation_result: { success: false, message: "BIN not registered." },
            }),
        });
        await settled(component);

        expect(queryOne(".o_l10n_kz_edi_test_connection").textContent).toInclude(
            "BIN not registered."
        );
        expect(".fa-minus-circle").toHaveCount(0);
        expect(".fa-times-circle").toHaveCount(1);
    });
});
