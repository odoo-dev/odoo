// @odoo-module ignore
/* eslint-disable no-restricted-globals */
/* eslint-disable no-undef */

const cacheName = "odoo-pos-cache";
// POS pages embed the session of their database: one cache per database, see cachedPosPage
const pageCachePrefix = "odoo-pos-pages-";
const NETWORK_TIMEOUT_MS = 2000;

/**
 * Config id targeted by a POS page URL: /pos/ui/<config_id>[/...] or the legacy
 * /pos/ui?config_id=<config_id> and /pos/web?config_id=<config_id> routes.
 */
const getPosConfigId = (url) => {
    const { pathname, searchParams } = new URL(url, self.location.origin);
    const configMatch = pathname.match(/^\/pos\/ui\/(\d+)(?:\/|$)/);
    if (configMatch) {
        return configMatch[1];
    }
    if (/^\/pos\/(ui|web)\/?$/.test(pathname)) {
        return searchParams.get("config_id");
    }
    return null;
};

const getPageCache = (database) => caches.open(`${pageCachePrefix}${database}`);

self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            // POS pages used to be cached with the other resources, whatever their database
            const cache = await caches.open(cacheName);
            const pageKeys = (await cache.keys()).filter((req) => getPosConfigId(req.url));
            await Promise.all(pageKeys.map((req) => cache.delete(req)));
            await self.clients.claim();
        })()
    );
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

const cacheNetworkResponse = async (request, networkPromise) => {
    try {
        const response = await networkPromise;
        if (response.ok) {
            const responseCopy = response.clone();
            const cache = await caches.open(cacheName);
            await cache.put(request, responseCopy);
        }
    } catch {
        // Offline, or the response could not be stored: the cached copy stays as is
    }
};

const offlinePage = () =>
    new Response("Offline - Page not cached", {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
    });

/**
 * Cached POS page for an unreachable server, only for the requested config. Nothing tells
 * which database a navigation belongs to (the session cookie is not readable): once this
 * browser has pages of several databases, serving any of them may boot the wrong one.
 */
const cachedPosPage = async (request) => {
    const configId = getPosConfigId(request.url);
    const pageCacheNames = (await caches.keys()).filter((name) => name.startsWith(pageCachePrefix));
    if (!configId || pageCacheNames.length !== 1) {
        return null;
    }
    const cache = await caches.open(pageCacheNames[0]);
    const exactResponse = await cache.match(request);
    if (exactResponse) {
        return exactResponse;
    }
    const candidateKeys = (await cache.keys()).filter(
        (req) => getPosConfigId(req.url) === configId
    );
    const preferredKey = candidateKeys.find((req) => !new URL(req.url).search) || candidateKeys[0];
    return preferredKey ? cache.match(preferredKey) : null;
};

const navigationRespond = async (request) => {
    // Network only, whatever the status: the cached page embeds a session, a CSRF token and
    // asset URLs that may be outdated, it is only a fallback for an unreachable server
    try {
        return await fetch(request);
    } catch {
        return (await cachedPosPage(request)) || offlinePage();
    }
};

const fetchCacheRespond = async (request, networkPromise) => {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);

    if (!cachedResponse) {
        try {
            return await networkPromise;
        } catch {
            return offlinePage();
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

    if (event.request.mode === "navigate") {
        // POS pages are cached per database from the urlsToCache message, not here
        event.respondWith(navigationRespond(event.request));
        return;
    }

    const networkPromise = fetch(event.request);
    // Registered synchronously so the worker stays alive until a response arriving after the
    // timeout, once the cached copy has been served, is stored in the cache
    event.waitUntil(cacheNetworkResponse(event.request, networkPromise));
    event.respondWith(fetchCacheRespond(event.request, networkPromise));
});

// Handle notification
self.addEventListener("message", (event) => {
    const { urlsToCache, database } = event.data || {};
    if (urlsToCache?.length) {
        event.waitUntil(
            (async () => {
                const cache = await caches.open(cacheName);
                const pageCache = database && (await getPageCache(database));
                const results = await Promise.allSettled(
                    urlsToCache.map(async (url) => {
                        const targetCache = getPosConfigId(url) ? pageCache : cache;
                        if (!targetCache) {
                            // A POS page of an unknown database must never be served offline
                            return;
                        }
                        try {
                            await targetCache.add(url);
                        } catch (err) {
                            console.warn("[ServiceWorker] Failed to cache resource:", url, err);
                            throw err;
                        }
                    })
                );
                const failed = results.filter((r) => r.status === "rejected").length;
                if (failed > 0) {
                    console.warn(
                        `[ServiceWorker] Pre-caching completed with ${failed}/${urlsToCache.length} failure(s)`
                    );
                }
            })()
        );
    }
});
