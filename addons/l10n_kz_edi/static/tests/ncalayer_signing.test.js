import { beforeEach, describe, expect, test } from "@odoo/hoot";
import { waitUntil } from "@odoo/hoot-dom";
import { mockWebSocket } from "@odoo/hoot-mock";
import { allowTranslations } from "@web/../tests/web_test_helpers";

import { signWithNCALayer } from "@l10n_kz_edi/js/test_connection_action";

describe.current.tags("headless");

// NCALayer pushes this frame the instant the socket opens -- before it has even
// read our request, let alone shown the signing wizard. Captured live from
// wss://127.0.0.1:13579 (NCALayer 1.4) by connecting and sending nothing.
const VERSION_FRAME = JSON.stringify({ result: { version: "1.4" } });

// The real answer to signXml, keyed by `code`/`message`/`responseObject`.
const SIGNED_FRAME = JSON.stringify({
    code: "200",
    message: "",
    responseObject: "<signedXml/>",
});

let serverWs;
let received;

beforeEach(() => {
    // The error paths build their message with _t(), which throws outright while
    // translations are unloaded -- without this the failures under test surface
    // as a hang rather than as the rejection they are.
    allowTranslations();
    serverWs = null;
    received = [];
    mockWebSocket((ws) => {
        serverWs = ws;
        ws.addEventListener("message", (event) => received.push(event.data));
    });
});

/** Open the socket and wait until the client side is actually OPEN. */
async function connected(promise) {
    await waitUntil(() => serverWs?.readyState);
    return promise;
}

describe("signWithNCALayer", () => {
    test("ignores the version frame NCALayer sends on open", async () => {
        const signed = connected(signWithNCALayer("<toSign/>"));
        await waitUntil(() => serverWs?.readyState);

        // The frame that used to resolve/close the socket prematurely.
        serverWs.send(VERSION_FRAME);
        // The wizard finishes only afterwards -- the socket must still be alive.
        serverWs.send(SIGNED_FRAME);

        expect(await signed).toBe("<signedXml/>");
    });

    test("asks NCALayer for an AUTHENTICATION signature", async () => {
        const signed = connected(signWithNCALayer("<toSign/>"));
        await waitUntil(() => received.length);

        expect(JSON.parse(received[0])).toEqual({
            module: "kz.gov.pki.knca.commonUtils",
            method: "signXml",
            args: ["PKCS12", "AUTHENTICATION", "<toSign/>", "", ""],
        });

        serverWs.send(SIGNED_FRAME);
        await signed;
    });

    test("reports the reason when the user cancels the wizard", async () => {
        const signed = connected(signWithNCALayer("<toSign/>"));
        await waitUntil(() => serverWs?.readyState);

        serverWs.send(VERSION_FRAME);
        serverWs.send(JSON.stringify({ code: "500", message: "action.canceled" }));

        await expect(signed).rejects.toThrow("action.canceled");
    });

    test("does not hang when NCALayer closes without answering", async () => {
        const signed = connected(signWithNCALayer("<toSign/>"));
        await waitUntil(() => serverWs?.readyState);

        serverWs.send(VERSION_FRAME);
        serverWs.close();

        await expect(signed).rejects.toThrow();
    });
});
