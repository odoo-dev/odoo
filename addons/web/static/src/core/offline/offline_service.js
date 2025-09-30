import { reactive } from "@odoo/owl";
import { browser } from "../browser/browser";
import { _t } from "../l10n/translation";
import { ConnectionLostError, rpc, rpcBus } from "../network/rpc";
import { registry } from "../registry";

const offlineSerice = {
    dependencies: ["notification"],

    async start(env, { notification }) {
        // TODO: Here we are going to depend on the first RPC that crash with a ConnectionLostError
        // Maybe could be interesting to be pro-active and call checkConnection at the beginning.

        let closeNotification = () => {};
        const offlineS = reactive({
            offline: false,
            views: ["list", "kanban", "form"],
            setOffline: () => {
                if (offlineS.offline) {
                    // notification already displayed (can occur if there were several
                    // concurrent rpcs when the connection was lost)
                    return;
                }
                offlineS.offline = true;
                closeNotification = notification.add(_t("Connection lost."), {
                    type: "danger",
                });
                let delay = 2000;
                browser.setTimeout(function checkConnection() {
                    if (offlineS.offline) {
                        rpc("/web/webclient/version_info", {})
                            .then(function () {
                                setOnline();
                            })
                            .catch(() => {
                                // exponential backoff, with some jitter
                                delay = delay * 1.5 + 500 * Math.random();
                                browser.setTimeout(checkConnection, delay);
                            });
                    }
                }, delay);
            },
        });

        function setOnline() {
            if (offlineS.offline) {
                offlineS.offline = false;
                closeNotification();
                env.services.notification.add(_t("Connection restored."), {
                    type: "success",
                });
            }
        }

        rpcBus.addEventListener("RPC:RESPONSE", (ev) => {
            if (!ev.detail.error) {
                setOnline();
            } else {
                if (ev.detail.error instanceof ConnectionLostError) {
                    offlineS.setOffline();
                }
            }
        });

        return offlineS;
    },
};

registry.category("services").add("offline", offlineSerice);
