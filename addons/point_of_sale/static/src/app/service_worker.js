// @odoo-module ignore
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

const cacheName = "odoo-pos-cache";
const NETWORK_TIMEOUT_MS = 2000;

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
});

const withTimeout = (promise, timeoutMs) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Network timeout")), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });

const fetchAndCache = async (cache, request) => {
    const response = await fetch(request);
    if (response.ok) {
        cache.put(request, response.clone()).catch(() => undefined);
    }
    return response;
};

const offlineFallback = async (cache, request) => {
    if (request.mode === "navigate") {
        const posUiKeys = (await cache.keys()).filter((req) => req.url.includes("/pos/ui"));
        const configMatch = request.url.match(/\/pos\/ui\/(\d+)/);
        const candidateKeys = configMatch
            ? posUiKeys.filter((req) => req.url.includes(`/pos/ui/${configMatch[1]}`))
            : posUiKeys;
        const preferredKey =
            candidateKeys.find((req) => !new URL(req.url).search) ||
            candidateKeys[0] ||
            posUiKeys.find((req) => !new URL(req.url).search) ||
            posUiKeys[0];
        if (preferredKey) {
            const fallbackResponse = await cache.match(preferredKey);
            if (fallbackResponse) {
                return fallbackResponse;
            }
        }
    }
    return new Response("Offline - Page not cached", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
    });
};

const fetchCacheRespond = async (event) => {
    const cache = await caches.open(cacheName);
    const request = event.request;
    const cachedResponse = await cache.match(request);

    const networkPromise = fetchAndCache(cache, request);
    networkPromise.catch(() => undefined);

    if (!cachedResponse) {
        try {
            return await networkPromise;
        } catch {
            return offlineFallback(cache, request);
        }
    }

    try {
        const response = await withTimeout(networkPromise, NETWORK_TIMEOUT_MS);
        if (response.ok) {
            return response;
        }
        return cachedResponse;
    } catch {
        return cachedResponse;
    }
};

self.addEventListener("fetch", (event) => {
    const url = event.request.url;

    // Ignore Chrome extensions and dataset. Dataset will be cached in indexedDB.
    if (
        url.includes("extension") ||
        url.includes("web/dataset") ||
        url.includes("Cashdro3WS/index3.php") ||
        event.request.method !== "GET"
    ) {
        return;
    }

    event.respondWith(fetchCacheRespond(event));
});

self.addEventListener("message", (event) => {
    const data = event.data;
    if (data?.urlsToCache?.length) {
        event.waitUntil(
            (async () => {
                const cache = await caches.open(cacheName);
                const results = await Promise.allSettled(
                    data.urlsToCache.map(async (url) => {
                        try {
                            await cache.add(url);
                        } catch (err) {
                            console.warn("[ServiceWorker] Failed to cache resource:", url, err);
                            throw err;
                        }
                    })
                );
                const failed = results.filter((r) => r.status === "rejected").length;
                if (failed > 0) {
                    console.warn(
                        `[ServiceWorker] Pre-caching completed with ${failed}/${data.urlsToCache.length} failure(s)`
                    );
                }
            })()
        );
    }
});
