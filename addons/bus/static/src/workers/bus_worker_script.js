/* eslint-env worker */
/* eslint-disable no-restricted-globals */

import { WorkerChannelHub } from "@bus/workers/worker_hub";

(async function () {
    await new Promise(setTimeout); // Let the controllers register before starting the router.
    const router = new WorkerChannelHub();
    if (self.name.includes("shared")) {
        // The script is running in a shared worker.
        onconnect = (ev) => {
            const port = ev.ports[0];
            router.registerClient(port);
            port.start();
        };
    } else {
        router.registerClient(self);
    }
})();
