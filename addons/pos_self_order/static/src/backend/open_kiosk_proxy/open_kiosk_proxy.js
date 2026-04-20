import { registry } from "@web/core/registry";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";

async function openKioskAction(env, action) {
    const { kiosk_url, proxy_ip } = action.params || {};

    if (!kiosk_url || !proxy_ip) {
        browser.open(kiosk_url, "_blank");
        return;
    }

    try {
        const url = new URL(kiosk_url, window.location.origin);
        url.searchParams.set("proxy", "true");

        const res = await fetch(`http://${proxy_ip}/kiosk`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            targetAddressSpace: "local",
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({
                command: "open",
                url: url.toString(),
            }),
        });

        if (res.ok) {
            env.services.notification.add(_t("Opening the kiosk on Proxy display"), {
                type: "success",
            });
            await env.services.action.doAction({
                type: "ir.actions.client",
                tag: "soft_reload",
            });
        } else {
            throw new Error("Proxy returned error");
        }
    } catch {
        env.services.notification.add(
            _t("Could not connect to Proxy. Opening in browser instead."),
            { type: "warning" }
        );
        browser.open(kiosk_url, "_blank");
    }
}

registry.category("actions").add("open_kiosk_proxy", openKioskAction);
