import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { useOfflineStatus } from "./offline_service";
import { RPCCache } from "../network/rpc_cache";
import { session } from "@web/session";

class OfflineSystray extends Component {
    static template = "web.OfflineSystray";
    static props = {};

    setup() {
        this.offlineService = useService("offline");
        this.status = useOfflineStatus();

        this.cache = new RPCCache("my_cache", session.registry_hash, session.browser_cache_secret);
        this.keyId = 0;
    }

    async onClick() {
        const uniq = luxon.DateTime.now().ts;
        for (let i = 1; i <= 2000; i++) {
            if (i % 100 === 0) {
                await new Promise((r) => setTimeout(r, 5000));
            }
            console.log("write " + i);
            await this.cache.read(
                "my_table",
                `my_key_${uniq}_${this.keyId++}`,
                async () => {
                    await new Promise((r) => setTimeout(r, 100));
                    return new Promise((resolve) => {
                        resolve(new Array(1_000_000).map(() => new Array(1_000_000)));
                    });
                },
                { type: "disk" }
            );
        }
    }
}

const offlineSystrayItem = {
    Component: OfflineSystray,
};

registry.category("systray").add("offline", offlineSystrayItem, { sequence: 1000 });
