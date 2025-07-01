/* eslint-env serviceworker */
/* eslint-disable no-restricted-globals */
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    if (event.notification.data) {
        const { action, model, res_id } = event.notification.data;
        if (model === "discuss.channel") {
            clients.openWindow(`/web#action=${action}&active_id=${res_id}`);
        } else {
            clients.openWindow(`/web#model=${model}&id=${res_id}`);
        }
    }
});
self.addEventListener("push", async (event) => {
    event.waitUntil(
        (async () => {
            // check if we need to unsubscribe from webpush
            // web/static/src/serviceworker/rpc.js
            // eslint-disable-next-line no-undef
            const connectedBackend = await isConnected();
            if (!connectedBackend) {
                const subscription = await self.registration.pushManager.getSubscription();
                await subscription?.unsubscribe?.();
                return;
            }
            const notification = event.data.json();
            await self.registration.showNotification(
                notification.title,
                notification.options || {}
            );
        })()
    );
});
self.addEventListener("pushsubscriptionchange", async (event) => {
    const subscription = await self.registration.pushManager.subscribe(
        event.oldSubscription.options
    );
    await fetch("/web/dataset/call_kw/mail.partner.device/register_devices", {
        headers: {
            "Content-type": "application/json",
        },
        body: JSON.stringify({
            id: 1,
            jsonrpc: "2.0",
            method: "call",
            params: {
                model: "mail.partner.device",
                method: "register_devices",
                args: [],
                kwargs: {
                    ...subscription.toJSON(),
                    previousEndpoint: event.oldSubscription.endpoint,
                },
                context: {},
            },
        }),
        method: "POST",
        mode: "cors",
        credentials: "include",
    });
});
