import { Plugin, useListener, usePlugin } from "@odoo/owl";
import { services } from "@web/core/services";
import { deepCopy } from "@web/core/utils/objects";
import { ORM } from "@web/core/orm_plugin";
import { GlobalBusPlugin } from "@web/core/global_bus_plugin";

export class LazySessionPlugin extends Plugin {
    #orm = usePlugin(ORM);
    #bus = usePlugin(GlobalBusPlugin).bus;
    #lazyConfigPromise = null;
    #resolveWebClientReady;
    #webClientReadyPromise = new Promise((r) => (this.#resolveWebClientReady = r));

    setup() {
        useListener(this.#bus, "WEB_CLIENT_READY", () => this.#resolveWebClientReady(), {
            once: true,
        });
    }

    async #fetchServerData() {
        await this.#webClientReadyPromise;
        return this.#orm.call("ir.http", "lazy_session_info");
    }

    getValue(key, callback) {
        if (!this.#lazyConfigPromise) {
            this.#lazyConfigPromise = this.#fetchServerData();
        }
        this.#lazyConfigPromise.then((config) => callback(deepCopy(config)[key]));
    }
}

services.add(LazySessionPlugin);
