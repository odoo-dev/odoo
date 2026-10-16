import { defineWebsiteModels } from "../website_helpers";
import {
    replaceLastOccurrence,
    buildMediaUrl,
    applyLogo,
    applyFavicon,
    applyWebsiteNameDOM,
    applyWebsiteNameTitleService,
} from "@website/builder/plugins/theme/theme_website_identification_util";
import { WebsiteBrandingPlugin } from "@website/builder/plugins/theme/theme_website_identification_plugin";
import { describe, test, expect, beforeEach, afterEach } from "@odoo/hoot";

defineWebsiteModels();

describe("Website Branding Helpers", () => {
    describe("replaceLastOccurrence", () => {
        test("replaces only the last occurrence of a string", () => {
            const result = replaceLastOccurrence("Odoo - Odoo", "Odoo", "Test");
            expect(result).toBe("Odoo - Test");
        });

        test("returns the original string if the search term is not found", () => {
            const result = replaceLastOccurrence("Hello World", "Odoo", "Test");
            expect(result).toBe("Hello World");
        });

        test("handles overlapping strings correctly", () => {
            const result = replaceLastOccurrence("aaa", "a", "b");
            expect(result).toBe("aab");
        });
    });

    describe("buildMediaUrl", () => {
        test("returns null if hasMedia is false", () => {
            expect(buildMediaUrl(1, "logo", false, 12345)).toBe(null);
        });
    });
    describe("applyLogo", () => {
        let container;

        // Avant chaque test, on recrée un DOM propre pour éviter les interférences
        beforeEach(() => {
            container = document.createElement("div");
            container.innerHTML = `
                <header>
                    <div class="navbar-brand logo">
                        <span><img src="old_header.png" /></span>
                    </div>
                </header>
                <footer>
                    <div class="o_footer_logo">
                        <img src="old_footer.png" />
                    </div>
                </footer>
                <div id="website_cookies_bar">
                    <img alt="Website Logo" src="old_cookie.png" />
                </div>
                <div>
                    <!-- This image should always remain untouched -->
                    <img class="untouched" src="ignore.png" />
                </div>
            `;
        });

        test("updates all target logos by default", () => {
            applyLogo(container, "new_logo.png");

            const headerLogo = container.querySelector("header .navbar-brand.logo span img");
            expect(headerLogo.getAttribute("src")).toBe("new_logo.png");

            const footerLogo = container.querySelector("footer .o_footer_logo img");
            expect(footerLogo.getAttribute("src")).toBe("new_logo.png");

            const cookieLogo = container.querySelector(
                "#website_cookies_bar img[alt='Website Logo']"
            );
            expect(cookieLogo.getAttribute("src")).toBe("new_logo.png");

            const untouchedLogo = container.querySelector(".untouched");
            expect(untouchedLogo.getAttribute("src")).toBe("ignore.png");
        });

        test("only updates the logos specified in the targets array", () => {
            applyLogo(container, "new_logo.png", ["header"]);

            const headerLogo = container.querySelector("header .navbar-brand.logo span img");
            expect(headerLogo.getAttribute("src")).toBe("new_logo.png"); // Mis à jour

            const footerLogo = container.querySelector("footer .o_footer_logo img");
            expect(footerLogo.getAttribute("src")).toBe("old_footer.png"); // Intact

            const cookieLogo = container.querySelector(
                "#website_cookies_bar img[alt='Website Logo']"
            );
            expect(cookieLogo.getAttribute("src")).toBe("old_cookie.png"); // Intact

            const untouchedLogo = container.querySelector(".untouched");
            expect(untouchedLogo.getAttribute("src")).toBe("ignore.png"); // Intact
        });
    });

    describe("applyWebsiteNameDOM", () => {
        test("updates image attributes and returns valid rollback functions", () => {
            const root = document.createElement("div");
            root.innerHTML = `
                <header>
                    <a class="navbar-brand">
                        <img src="logo.png" alt="Logo of Old Name" title="Old Name" />
                        <span role="img" aria-label="Logo of Old Name" title="Old Name"></span>
                    </a>
                </header>
            `;

            const rollbacks = applyWebsiteNameDOM(root, "New Name", "Old Name");

            const img = root.querySelector("img");
            expect(img.getAttribute("alt")).toBe("Logo of New Name");
            expect(img.getAttribute("title")).toBe("New Name");

            const span = root.querySelector("span");
            expect(span.getAttribute("aria-label")).toBe("Logo of New Name");
            expect(span.getAttribute("title")).toBe("New Name");

            rollbacks.forEach((r) => r(root));

            expect(img.getAttribute("alt")).toBe("Logo of Old Name");
            expect(img.getAttribute("title")).toBe("Old Name");
            expect(span.getAttribute("aria-label")).toBe("Logo of Old Name");
            expect(span.getAttribute("title")).toBe("Old Name");
        });

        test("updates textContent and returns valid rollback functions", () => {
            const root = document.createElement("div");
            root.innerHTML = `
                <header>
                    <a class="navbar-brand">
                        <span>Old Name</span>
                    </a>
                </header>
            `;

            const rollbacks = applyWebsiteNameDOM(root, "New Name", "Old Name");

            const span = root.querySelector("span");
            expect(span.textContent).toBe("New Name");

            rollbacks.forEach((r) => r(root));

            expect(span.textContent).toBe("Old Name");
        });
    });

    describe("applyWebsiteNameTitleService", () => {
        test("does nothing if the name has not changed", () => {
            let setPartsCalled = false;
            const titleServiceMock = {
                getParts: () => ({ website: "Odoo" }),
                setParts: () => {
                    setPartsCalled = true;
                },
            };

            const rollbacks = applyWebsiteNameTitleService(titleServiceMock, "Odoo", "Odoo");
            expect(setPartsCalled).toBe(false);
            expect(rollbacks.length).toBe(0); // Should return an empty array
        });

        test("updates only the title parts containing the previous name and allows rollback", () => {
            let currentParts = {
                website: "My Odoo Site - Odoo",
                page: "Home",
                other: "Odoo is cool",
            };

            const titleServiceMock = {
                getParts: () => currentParts,
                setParts: (parts) => {
                    currentParts = { ...currentParts, ...parts };
                },
            };

            const rollbacks = applyWebsiteNameTitleService(titleServiceMock, "Test", "Odoo");

            expect(currentParts.website).toBe("My Odoo Site - Test");
            expect(currentParts.other).toBe("Test is cool");
            expect(currentParts.page).toBe("Home"); // Untouched

            // Verify Rollback restores title service parts
            rollbacks.forEach((r) => r());

            expect(currentParts.website).toBe("My Odoo Site - Odoo");
            expect(currentParts.other).toBe("Odoo is cool");
        });
    });
    describe("applyFavicon", () => {
        let originalIcons = [];
        const topHead = window.top.document.head;

        beforeEach(() => {
            // 1. Backup original test runner icons to avoid breaking the UI
            originalIcons = Array.from(topHead.querySelectorAll("link[rel*='icon']"));
            originalIcons.forEach((icon) => icon.remove());
            ["icon", "shortcut icon", "apple-touch-icon"].forEach((relType) => {
                const link = window.top.document.createElement("link");
                link.rel = relType;
                link.href = "old-favicon.ico";
                topHead.appendChild(link);
            });
        });

        afterEach(() => {
            topHead.querySelectorAll("link[rel*='icon']").forEach((icon) => icon.remove());
            originalIcons.forEach((icon) => topHead.appendChild(icon));
        });

        test("removes all previous icons and recreates them with the new URL", () => {
            applyFavicon("new-favicon.ico");

            const newIcons = Array.from(topHead.querySelectorAll("link[rel*='icon']"));
            const rels = newIcons.map((link) => link.rel);

            expect(rels.includes("icon")).toBe(true);
            expect(rels.includes("shortcut icon")).toBe(true);
            expect(rels.includes("apple-touch-icon")).toBe(true);

            newIcons.forEach((link) => {
                expect(link.getAttribute("href")).toBe("new-favicon.ico");
            });
        });
    });
});

describe("WebsiteBrandingPlugin (Save & Discard Flows)", () => {
    let plugin;
    let rootElement;
    let ormCallSpy;
    let topHead;
    let originalIcons = [];

    beforeEach(() => {
        // 1. Mock window.top.document.head for favicon logic
        topHead = window.top.document.head;
        originalIcons = Array.from(topHead.querySelectorAll("link[rel*='icon']"));
        originalIcons.forEach((icon) => icon.remove());

        // 2. Mock a basic DOM (rootElement) simulating the website header
        rootElement = document.createElement("div");
        rootElement.innerHTML = `
            <header>
                <a class="navbar-brand">
                    <span>Old Name</span>
                </a>
                
                <div class="navbar-brand logo">
                    <span>
                        <img src="/old_logo.png" />
                    </span>
                </div>
            </header>
        `;
        // 3. Mock ORM to track payloads sent during save
        ormCallSpy = [];
        const mockOrm = {
            read: async () => [{ favicon: true }],
            searchCount: async () => 1, // <--- AJOUTER CETTE LIGNE
            call: async (model, method, args) => {
                ormCallSpy.push({ model, method, args });
                // Simulate ORM returning saved data
                return {
                    name: args[1].name || "Old Name",
                    has_favicon: !!args[1].favicon,
                    has_logo: !!args[1].logo,
                };
            },
        };

        // 4. Mock Media Dependency
        const mockMedia = {
            openMediaDialog: async (options) => {
                const fakeElement = document.createElement("img");
                fakeElement.src = "/new_image.png";
                fakeElement.dataset.id = "42"; // Fake attachment ID
                options.save(fakeElement);
            },
        };

        // 5. Create the context payload for the Plugin constructor
        const pluginContext = {
            document: rootElement,
            services: {
                website: { currentWebsite: { id: 1, name: "Old Name" } },
                orm: mockOrm,
                title: { getParts: () => ({}), setParts: () => {} },
            },
            dependencies: {
                media: mockMedia,
            },
        };

        // 6. Instantiate with the context to satisfy the base Plugin class
        plugin = new WebsiteBrandingPlugin(pluginContext);

        // Re-assigning manually as a fallback for internal Odoo plugin mechanics
        plugin.document = rootElement;
        plugin.services = pluginContext.services;
        plugin.dependencies = pluginContext.dependencies;

        // Initialize the plugin
        plugin.setup();
    });

    afterEach(() => {
        topHead.querySelectorAll("link[rel*='icon']").forEach((icon) => icon.remove());
        originalIcons.forEach((icon) => topHead.appendChild(icon));
    });

    // ============================================================================
    // SAVE FLOW
    // ============================================================================
    test("Save flow: applies preview, saves via ORM, and cleans DOM to avoid COW", async () => {
        plugin.updateName("My Awesome Site");
        await plugin.updateLogo();
        await plugin.updateFavicon();

        expect(plugin.staged.name).toBe("My Awesome Site");
        expect(rootElement.querySelector(".navbar-brand span").textContent).toBe("My Awesome Site");
        expect(
            rootElement.querySelector("header .navbar-brand.logo span img").getAttribute("src")
        ).toBe("/new_image.png");

        await plugin.onWillSave();

        // Assert: Payload is correctly sent to ORM
        expect(ormCallSpy.length).toBe(1);
        const payload = ormCallSpy[0].args[1];
        expect(payload.name).toBe("My Awesome Site");
        expect(payload.logo).toBe(42);
        expect(payload.favicon).toBe(42);

        // Assert: Staged changes are cleared, and original values updated
        expect(Object.keys(plugin.staged).length).toBe(0);
        expect(plugin.originalValues.name).toBe("My Awesome Site");

        plugin.cleanAfterSave(rootElement);

        // Assert: DOM is reverted to its original state to avoid saving hardcoded values
        expect(rootElement.querySelector(".navbar-brand span").textContent).toBe("Old Name");
    });

    // ============================================================================
    // DISCARD FLOW
    // ============================================================================
    test("Discard flow: applies preview, skips ORM, and restores DOM to original", async () => {
        plugin.updateName("Discarded Name");
        await plugin.updateLogo();

        // Assert: Changes are visible in the preview DOM
        expect(plugin.staged.name).toBe("Discarded Name");
        expect(rootElement.querySelector(".navbar-brand span").textContent).toBe("Discarded Name");

        plugin.cleanAfterSave(rootElement);

        // Assert: No ORM call was made
        expect(ormCallSpy.length).toBe(0);

        // Assert: DOM is restored to the original state
        expect(rootElement.querySelector(".navbar-brand span").textContent).toBe("Old Name");
    });
});
