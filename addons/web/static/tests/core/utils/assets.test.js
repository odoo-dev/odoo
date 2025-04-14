import { after, expect, test } from "@odoo/hoot";
import { animationFrame, manuallyDispatchProgrammaticEvent } from "@odoo/hoot-dom";
import { mockFetch } from "@odoo/hoot-mock";
import { mountWithCleanup, onRpc, patchWithCleanup } from "@web/../tests/web_test_helpers";

import { assets, cacheMapByDocument, loadBundle, loadCSS, loadJS } from "@web/core/assets";
import { registry } from "@web/core/registry";
import { resetLazySessionValue } from "@web/core/user";
import { session } from "@web/session";
import { WebClient } from "@web/webclient/webclient";
import { onMounted } from "@odoo/owl";

/**
 * @param {(node: Node) => void} callback
 */
const mockHeadAppendChild = (callback) => {
    const currentDocumentMap = cacheMapByDocument.get(document);
    cacheMapByDocument.set(document, new Map());
    after(() => {
        cacheMapByDocument.set(document, currentDocumentMap);
    });
    patchWithCleanup(document.head, {
        appendChild: callback,
    });
};

const bundles = {
    "/web/bundle/test.bundle": [
        { type: "link", src: "file1.css" },
        { type: "link", src: "file2.css" },
        { type: "script", src: "file1.js" },
        { type: "script", src: "file2.js" },
    ],
};

test.tags("headless")("loadJS: load invalid JS lib", async () => {
    expect.assertions(4);

    mockHeadAppendChild((node) => {
        expect(node).toBeInstanceOf(HTMLScriptElement);
        expect(node).toHaveAttribute("type", "text/javascript");
        expect(node).toHaveAttribute("src", "/some/invalid/file.js");

        // Simulates a failed request to an invalid file.
        manuallyDispatchProgrammaticEvent(node, "error");
    });

    await expect(loadJS("/some/invalid/file.js")).rejects.toThrow(
        /The loading of \/some\/invalid\/file.js failed/,
        { message: "Trying to load an invalid file rejects the promise" }
    );
});

test.tags("headless")("loadCSS: load invalid CSS lib", async () => {
    expect.assertions(4 * 4 + 1);

    assets.retries = { count: 3, delay: 1, extraDelay: 1 }; // Fail fast.

    mockHeadAppendChild((node) => {
        expect(node).toBeInstanceOf(HTMLLinkElement);
        expect(node).toHaveAttribute("rel", "stylesheet");
        expect(node).toHaveAttribute("type", "text/css");
        expect(node).toHaveAttribute("href", "/some/invalid/file.css");

        // Simulates a failed request to an invalid file.
        manuallyDispatchProgrammaticEvent(node, "error");
    });

    await expect(loadCSS("/some/invalid/file.css")).rejects.toThrow(
        /The loading of \/some\/invalid\/file.css failed/,
        { message: "Trying to load an invalid file rejects the promise" }
    );
});

test.tags("headless")("loadBundle: load js and css files", async () => {
    mockFetch((route) => {
        expect.step(`fetch bundle: ${route.pathname}`);
        return bundles[route.pathname];
    });

    mockHeadAppendChild(async (node) => {
        const srcAttribute = node.tagName === "LINK" ? "href" : "src";
        expect.step(`add ${node.tagName} - ${node.type} - ${node.getAttribute(srcAttribute)}`);
    });

    loadBundle("test.bundle");
    await animationFrame();
    expect.verifySteps([
        "fetch bundle: /web/bundle/test.bundle",
        "add LINK - text/css - file1.css",
        "add LINK - text/css - file2.css",
        "add SCRIPT - text/javascript - file1.js",
        "add SCRIPT - text/javascript - file2.js",
    ]);
});

test.tags("headless")("loadBundle: load only js files", async () => {
    mockFetch((route) => {
        expect.step(`fetch bundle: ${route.pathname}`);
        return bundles[route.pathname];
    });

    mockHeadAppendChild(async (node) => {
        const srcAttribute = node.tagName === "LINK" ? "href" : "src";
        expect.step(`add ${node.tagName} - ${node.type} - ${node.getAttribute(srcAttribute)}`);
    });

    loadBundle("test.bundle", { css: false });
    await animationFrame();
    expect.verifySteps([
        "fetch bundle: /web/bundle/test.bundle",
        "add SCRIPT - text/javascript - file1.js",
        "add SCRIPT - text/javascript - file2.js",
    ]);
});

test.tags("headless")("loadBundle: load only css files", async () => {
    mockFetch((route) => {
        expect.step(`fetch bundle: ${route.pathname}`);
        return bundles[route.pathname];
    });

    mockHeadAppendChild(async (node) => {
        const srcAttribute = node.tagName === "LINK" ? "href" : "src";
        expect.step(`add ${node.tagName} - ${node.type} - ${node.getAttribute(srcAttribute)}`);
    });

    loadBundle("test.bundle", { js: false });
    await animationFrame();
    expect.verifySteps([
        "fetch bundle: /web/bundle/test.bundle",
        "add LINK - text/css - file1.css",
        "add LINK - text/css - file2.css",
    ]);
});

test.tags("headless")("loadBundle: load same bundle in main document and an iframe", async () => {
    mockFetch((route) => {
        expect.step(`fetch bundle: ${route.pathname}`);
        return bundles[route.pathname];
    });

    mockHeadAppendChild(async (node) => {
        const srcAttribute = node.tagName === "LINK" ? "href" : "src";
        expect.step(
            `add document ${node.tagName} - ${node.type} - ${node.getAttribute(srcAttribute)}`
        );
    });

    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const iframeDocument = iframe.contentDocument;
    patchWithCleanup(iframeDocument.head, {
        appendChild: (node) => {
            const srcAttribute = node.tagName === "LINK" ? "href" : "src";
            expect.step(
                `add iframe document ${node.tagName} - ${node.type} - ${node.getAttribute(
                    srcAttribute
                )}`
            );
        },
    });

    loadBundle("test.bundle");
    await animationFrame();
    expect.verifySteps([
        "fetch bundle: /web/bundle/test.bundle",
        "add document LINK - text/css - file1.css",
        "add document LINK - text/css - file2.css",
        "add document SCRIPT - text/javascript - file1.js",
        "add document SCRIPT - text/javascript - file2.js",
    ]);

    loadBundle("test.bundle", { targetDoc: iframeDocument });
    await animationFrame();
    expect.verifySteps([
        "fetch bundle: /web/bundle/test.bundle",
        "add iframe document LINK - text/css - file1.css",
        "add iframe document LINK - text/css - file2.css",
        "add iframe document SCRIPT - text/javascript - file1.js",
        "add iframe document SCRIPT - text/javascript - file2.js",
    ]);

    iframe.remove();
});

test("loadBundle: use lazy_session and standard ways", async () => {
    resetLazySessionValue();
    const bundleName = "test.bundle";
    const bundle = `/web/bundle/${bundleName}`;
    const bundleLazyName = "test.bundle.lazy";
    const bundleLazy = `/web/bundle/${bundleLazyName}`;
    bundles[bundleLazy] = bundles[bundle].map((item) => ({ ...item, src: `lazy_${item.src}` }));

    onRpc(
        bundle,
        () => {
            expect.step(`fetch bundle: ${bundle}`);
            return bundles[bundle];
        },
        { pure: true }
    );

    onRpc("lazy_session_info", () => {
        expect.step(`lazy_session_info bundle: ${bundleLazy}`);
        const bundles_lazy = {};
        bundles_lazy[bundleLazyName] = bundles[bundleLazy];
        return {
            bundles: bundles_lazy,
        };
    });

    patchWithCleanup(session, {
        lazy_bundles_name: [bundleLazyName],
    });

    patchWithCleanup(WebClient.prototype, {
        setup() {
            super.setup();
            onMounted(() => expect.step("web_client_mounted"));
        },
    });

    mockHeadAppendChild(async (node) => {
        const srcAttribute = node.tagName === "LINK" ? "href" : "src";
        expect.step(
            `add document ${node.tagName} - ${node.type} - ${node.getAttribute(srcAttribute)}`
        );
    });

    const serviceRegistry = registry.category("services");
    serviceRegistry.add("fake_a", {
        start() {
            expect.step("service_before");
            loadBundle(bundleName); //
            loadBundle(bundleLazyName);
            expect.step("service_after");
        },
    });

    await mountWithCleanup(WebClient);
    await animationFrame();
    await animationFrame();
    expect.verifySteps([
        "service_before",
        "fetch bundle: /web/bundle/test.bundle",
        "service_after",
        "add document LINK - text/css - file1.css",
        "add document LINK - text/css - file2.css",
        "add document SCRIPT - text/javascript - file1.js",
        "add document SCRIPT - text/javascript - file2.js",
        "web_client_mounted",
        "lazy_session_info bundle: /web/bundle/test.bundle.lazy",
        "add document LINK - text/css - lazy_file1.css",
        "add document LINK - text/css - lazy_file2.css",
        "add document SCRIPT - text/javascript - lazy_file1.js",
        "add document SCRIPT - text/javascript - lazy_file2.js",
    ]);
});

test("loadBundle: lazy_session missing lazy_session_bundle infos throw error", async () => {
    expect.errors(1);
    resetLazySessionValue();
    const bundleName = "test.bundle.error";
    onRpc("lazy_session_info", () => ({ bundles: [] }));
    patchWithCleanup(session, { lazy_bundles_name: [bundleName] });

    const serviceRegistry = registry.category("services");
    serviceRegistry.add("fake_a", {
        start() {
            loadBundle(bundleName);
        },
    });

    await mountWithCleanup(WebClient);
    await animationFrame();
    expect.verifyErrors(["Error: Missing bundle test.bundle.error in lazy_session_info !"]);
});
