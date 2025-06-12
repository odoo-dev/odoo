// @odoo-module ignore

/* eslint-disable no-restricted-globals */
const cacheName = "odoo-sw-cache";
const offLineURL = "/odoo/offline";

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(cacheName).then((cache) => cache.add(offLineURL)));
});

const storeDataOnCache = async (url, response) => {
    console.log(`[SW] Caching new resource: ${url}`);
    const cache = await caches.open(cacheName);
    await cache.put(url, response);
};

const readDataOnCache = async (url) => {
    console.log(`[SW] Reading resource from Caching: ${url}`);
    const cache = await caches.open(cacheName);
    return cache.match(url);
};

const navigateOrDisplayOfflinePage = async (request) => {
    try {
        const response = await fetch(request);
        storeDataOnCache(request.url, response.clone());
        return response;
    } catch (requestError) {
        if (
            request.method === "GET" &&
            ["Failed to fetch", "Load failed"].includes(requestError.message)
        ) {
            if (
                !navigator.onLine &&
                !new URL(request.url).searchParams.get("debug")?.includes("assets")
            ) {
                const cachedResponse = await readDataOnCache(request.url);
                if (cachedResponse) {
                    return cachedResponse;
                }
            }
            const offlinePage = await readDataOnCache(offLineURL);
            if (offlinePage) {
                return offlinePage;
            }
        }
        throw requestError;
    }
};

const serveShareTarget = (event) => {
    // Redirect so the user can refresh the page without resending data.
    event.respondWith(Response.redirect("/odoo?share_target=trigger"));
    event.waitUntil(
        (async () => {
            // The page sends this message to tell the service worker it's ready to receive the file.
            await waitingMessage("odoo_share_target");
            const client = await self.clients.get(event.resultingClientId || event.clientId);
            const data = await event.request.formData();
            client.postMessage({
                shared_files: data.getAll("externalMedia") || [],
                action: "odoo_share_target_ack",
            });
        })()
    );
};

self.addEventListener("fetch", (event) => {
    if (
        event.request.method === "POST" &&
        new URL(event.request.url).searchParams.has("share_target")
    ) {
        return serveShareTarget(event);
    }
    if (
        (event.request.mode === "navigate" && event.request.destination === "document") ||
        // request.mode = navigate isn't supported in all browsers => check for http header accept:text/html
        event.request.headers.get("accept").includes("text/html")
    ) {
        event.respondWith(navigateOrDisplayOfflinePage(event.request));
    }
});

/**
 *
 * @type {Map<String, Function[]>}
 */
const nextMessageMap = new Map();
/**
 *
 * @param message : string
 * @return {Promise}
 */
const waitingMessage = async (message) =>
    new Promise((resolve) => {
        if (!nextMessageMap.has(message)) {
            nextMessageMap.set(message, []);
        }
        nextMessageMap.get(message).push(resolve);
    });

self.addEventListener("message", (event) => {
    const messageNotifiers = nextMessageMap.get(event.data);
    if (messageNotifiers) {
        for (const messageNotified of messageNotifiers) {
            messageNotified();
        }
        nextMessageMap.delete(event.data);
    }
});
