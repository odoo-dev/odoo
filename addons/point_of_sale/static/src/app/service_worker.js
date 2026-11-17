// @odoo-module ignore
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

const cacheName = "odoo-pos-cache";

const getPosConfigId = (url) =>
    new URL(url, self.location.origin).pathname.match(/^\/pos\/ui\/(\d+)(?:\/|$)/)?.[1];

/**
 * The POS page of the same config, for a navigation to a sub-route or a query string that
 * was never cached, preferably without query string.
 */
const similarPosPage = async (cache, url) => {
    const configId = getPosConfigId(url);
    if (!configId) {
        return;
    }
    const configRequests = (await cache.keys()).filter(
        (cached) => getPosConfigId(cached.url) === configId
    );
    const similarRequest =
        configRequests.find((cached) => !new URL(cached.url).search) || configRequests[0];
    return similarRequest && cache.match(similarRequest);
};

const fetchCacheRespond = async (event) => {
    const cache = await caches.open(cacheName);
    try {
        const response = await fetch(event.request);
        // A server error, e.g. a 502 while the server restarts behind a proxy, keeps the cached copy
        if (response.ok) {
            cache.put(event.request, response.clone());
        }
        return response;
    } catch {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse || event.request.mode !== "navigate") {
            return cachedResponse;
        }
        return similarPosPage(cache, event.request.url);
    }
};

const cacheResources = async (event) => {
    const url = event.request.url;

    try {
        const cache = await caches.open(cacheName);
        await cache.add(url);
    } catch (error) {
        console.info("Failed to cache resource", url, error);
    }
};

self.addEventListener("fetch", (event) => {
    const url = event.request.url;

    // Ignore Chrome extensions and dataset. Dataset will be cached in indexedDB.
    if (
        url.includes("extension") ||
        url.includes("web/dataset") ||
        url.includes("Cashdro3WS/index3.php") ||
        event.request.headers.get("X-No-SW-Cache") ||
        event.request.method !== "GET"
    ) {
        return;
    }

    event.respondWith(fetchCacheRespond(event));
});

// Handle notification
self.addEventListener("message", (event) => {
    const data = event.data;
    if (data.urlsToCache && navigator.onLine) {
        for (const url of data.urlsToCache) {
            cacheResources({ request: { url } });
        }
    }
});
