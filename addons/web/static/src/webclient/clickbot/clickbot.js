/**
 * The purpose of this test is to click on every installed App and then open each
 * view. On each view, click on each filter.
 */

(function (exports) {
    "use strict";

    const MOUSE_EVENTS = ["mouseover", "mouseenter", "mousedown", "mouseup", "click"];
    const BLACKLISTED_MENUS = [
        "base.menu_theme_store",
        "base.menu_third_party",
        "account.menu_action_account_bank_journal_form",
        "event_barcode.menu_event_registration_desk", // there's no way to come back from this menu
        "hr_attendance.menu_hr_attendance_kiosk_no_user_mode", // same here
        "pos_adyen.menu_pos_adyen_account",
        "payment_odoo.menu_adyen_account",
        "payment_odoo.root_adyen_menu",
    ];
    // If you change this selector, adapt Studio test "Studio icon matches the clickbot selector"
    const STUDIO_SYSTRAY_ICON_SELECTOR = ".o_web_studio_navbar_item:not(.o_disabled) i";

    const { isEnterprise } = odoo.info;
    const { onWillStart } = owl;
    let appsMenusOnly = false;
    const isStudioInstalled = odoo.loader.modules.has("@web_studio/studio_service");
    let actionCount = 0;
    let viewUpdateCount = 0;
    let studioCount = 0;

    let appIndex;
    let menuIndex;
    let subMenuIndex;
    let testedApps;
    let testedMenus;

    function getDropdownMenu(togglerSelector) {
        const el =
            typeof togglerSelector === "string"
                ? document.querySelector(togglerSelector)
                : togglerSelector;
        return document.querySelector(
            `.o-dropdown--menu[data-popover-id="${el.dataset.popoverFor}"]`
        );
    }

    /**
     * Hook on specific activities of the webclient to detect when to move forward.
     * This should be done only once.
     */
    let setupDone = false;
    function ensureSetup() {
        if (setupDone) {
            return;
        }
        setupDone = true;
        const env = odoo.__WOWL_DEBUG__.root.env;
        env.bus.addEventListener("ACTION_MANAGER:UI-UPDATED", () => {
            actionCount++;
        });

        const { patch } = odoo.loader.modules.get("@web/core/utils/patch");
        const { WithSearch } = odoo.loader.modules.get("@web/search/with_search/with_search");

        patch(WithSearch.prototype, {
            setup() {
                super.setup();
                onWillStart(() => {
                    viewUpdateCount++;
                });
            },
            async render() {
                await super.render(...arguments);
                viewUpdateCount++;
            },
        });

        // This test file is not respecting Odoo module dependencies.
        // The following module might not be loaded (eg. if mail is not installed).
        const DiscussWidgetModule = odoo.loader.modules.get("@mail/widgets/discuss/discuss");
        const DiscussWidget = DiscussWidgetModule && DiscussWidgetModule[Symbol.for("default")];
        if (DiscussWidget) {
            DiscussWidget.include({
                /**
                 * Overriding a method that is called every time the discuss
                 * component is updated.
                 */
                _updateControlPanel: async function () {
                    await this._super(...arguments);
                    viewUpdateCount++;
                },
            });
        }
    }

    /**
     * Returns a promise that resolves after the next animation frame.
     *
     * @returns {Promise}
     */
    async function waitForNextAnimationFrame() {
        await new Promise(setTimeout);
        await new Promise((r) => requestAnimationFrame(r));
    }

    /**
     * Simulate all of the mouse events triggered during a click action.
     *
     * @param {EventTarget} target the element on which to perform the click
     * @param {string} elDescription description of the item
     * @returns {Promise} resolved after next animation frame
     */
    async function triggerClick(target, elDescription) {
        if (target) {
            console.log("Clicking on", elDescription);
        } else {
            throw new Error(`No element "${elDescription}" found.`);
        }
        MOUSE_EVENTS.forEach((type) => {
            const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
            target.dispatchEvent(event);
        });
        await waitForNextAnimationFrame();
    }

    /**
     * Wait a certain amount of time for a condition to occur
     *
     * @param {function} stopCondition a function that returns a boolean
     * @param {Number} tl the maximum wait time before stopping, in milliseconds
     * @returns {Promise} that is rejected if the timeout is exceeded
     */
    async function waitForCondition(stopCondition, tl = 30000) {
        const interval = 25;
        let timeLimit = tl;
        while (!stopCondition()) {
            if (timeLimit <= 0) {
                throw new Error(
                    `Timeout, the clicked element took more than ${tl / 1000} seconds to load`
                );
            }
            await new Promise((resolve) => setTimeout(resolve, interval));
            timeLimit -= interval;
        }
    }

    /**
     * Make sure the home menu is open (enterprise only)
     */
    async function ensureHomeMenu() {
        const homeMenu = document.querySelector(".o_home_menu");
        if (!homeMenu) {
            let menuToggle = document.querySelector("nav.o_main_navbar > a.o_menu_toggle");
            if (!menuToggle) {
                // In the Barcode application, there is no navbar. So you have to click
                // on the o_stock_barcode_menu button which is the equivalent of
                // the o_menu_toggle button in the navbar.
                menuToggle = document.querySelector(".o_stock_barcode_menu");
            }
            await triggerClick(menuToggle, "home menu toggle button");
            await waitForCondition(() => document.querySelector(".o_home_menu"));
        }
    }

    /**
     * Make sure the apps menu is open (community only)
     */
    async function ensureAppsMenu() {
        const appsMenu = getDropdownMenu(".o_navbar_apps_menu .dropdown-toggle");
        if (!appsMenu) {
            const toggler = document.querySelector(".o_navbar_apps_menu .dropdown-toggle");
            await triggerClick(toggler, "apps menu toggle button");
            await waitForCondition(() => getDropdownMenu(".o_navbar_apps_menu .dropdown-toggle"));
        }
    }

    /**
     * Return the next menu to test, and update the internal counters.
     *
     * @returns {DomElement}
     */
    async function getNextMenu() {
        const menus = document.querySelectorAll(
            ".o_menu_sections > .dropdown-toggle, .o_menu_sections > .dropdown-item"
        );
        if (menuIndex === menus.length) {
            menuIndex = 0;
            return; // all menus done
        }
        let menu = menus[menuIndex];
        if (menu.classList.contains("dropdown-toggle")) {
            // the current menu is a dropdown toggler -> open it and pick a menu inside the dropdown
            if (!getDropdownMenu(menu)) {
                // might already be opened if the last menu was blacklisted
                await triggerClick(menu, "menu toggler");
            }

            const items = getDropdownMenu(menu).querySelectorAll(".dropdown-item");
            menu = items[subMenuIndex];
            if (subMenuIndex === items.length - 1) {
                // this is the last item, so go to the next menu
                menuIndex++;
                subMenuIndex = 0;
            } else {
                // this isn't the last item, so increment the index inside this dropdown
                subMenuIndex++;
            }
        } else {
            // the current menu isn't a dropdown, so go to the next menu
            menuIndex++;
        }
        return menu;
    }

    /**
     * Return the next app to test, and update the internal counter.
     *
     * @returns {DomElement}
     */
    async function getNextApp() {
        let apps;
        if (isEnterprise) {
            await ensureHomeMenu();
            apps = document.querySelectorAll(".o_apps .o_app");
        } else {
            await ensureAppsMenu();
            apps = getDropdownMenu(".o_navbar_apps_menu .dropdown-toggle").querySelectorAll(
                ".o-dropdown--menu .dropdown-item"
            );
            console.log(apps);
        }
        const app = apps[appIndex];
        appIndex++;
        return app;
    }

    /**
     * Test Studio
     * Click on the Studio systray item to enter Studio, and simply leave it once loaded.
     */
    async function testStudio() {
        if (!isStudioInstalled) {
            return;
        }
        const studioIcon = document.querySelector(STUDIO_SYSTRAY_ICON_SELECTOR);
        if (!studioIcon) {
            return;
        }
        // Open the filter menu dropdown
        await triggerClick(studioIcon, "entering studio");
        await waitForCondition(() => document.querySelector(".o_in_studio"));
        await triggerClick(document.querySelector(".o_web_studio_leave"), "leaving studio");
        await waitForCondition(() =>
            document.querySelector(".o_main_navbar:not(.o_studio_navbar) .o_menu_toggle")
        );
        studioCount++;
    }

    /**
     * Test filters
     * Click on each filter in the control pannel
     */
    async function testFilters() {
        if (appsMenusOnly === true) {
            return;
        }
        const searchViewToggle = document.querySelector(".o_searchview_dropdown_toggler");
        if (!searchViewToggle) {
            return;
        }
        // Open the filter menu dropdown
        await triggerClick(searchViewToggle, `toggling searchview menu`);

        const simpleFilterSel = ".o_filter_menu > .dropdown-item:not(.o_add_custom_filter)";
        const dateFilterSel = ".o_filter_menu > .dropdown-toggle:not(.o_add_custom_filter)";
        const filterMenuItems = document.querySelectorAll(`${simpleFilterSel},${dateFilterSel}`);
        console.log("Testing", filterMenuItems.length, "filters");
        for (const filter of filterMenuItems) {
            const currentViewCount = viewUpdateCount;
            if (filter.classList.contains("o_accordion_toggle")) {
                await triggerClick(filter, `filter "${filter.innerText.trim()}"`);

                // If a fitler has options, it will simply unfold and show all options.
                // We then click on the first one.
                const firstOption = filter.nextElementSibling.querySelector(".dropdown-item");
                if (firstOption) {
                    await triggerClick(
                        firstOption,
                        `filter option "${firstOption.innerText.trim()}"`
                    );
                    await waitForCondition(() => currentViewCount !== viewUpdateCount);
                }
            } else if (!filter.classList.contains("o_menu_item")) {
                // Advanced Search item
                await triggerClick(filter, `Advanced Search}"`);
                await waitForCondition(() => !!document.querySelector(`.modal button.btn-close`));
                await triggerClick(
                    document.querySelector(`.modal button.btn-close`),
                    "close 'Advanced Search' dialog"
                );
                await waitForCondition(() => !document.querySelector(`.modal button.btn-close`));
            } else {
                await triggerClick(filter, `filter "${filter.innerText.trim()}"`);
                await waitForCondition(() => currentViewCount !== viewUpdateCount);
            }
        }
    }

    /**
     * Orchestrate the test of views
     * This function finds the buttons that permit to switch views and orchestrate
     * the click on each of them
     * @returns {Promise}
     */
    async function testViews() {
        if (appsMenusOnly === true) {
            return;
        }
        const switchButtons = document.querySelectorAll(
            "nav.o_cp_switch_buttons > button.o_switch_view:not(.active):not(.o_map)"
        );
        for (const switchButton of switchButtons) {
            // Only way to get the viewType from the switchButton
            const viewType = [...switchButton.classList]
                .find((cls) => cls !== "o_switch_view" && cls.startsWith("o_"))
                .slice(2);
            console.log("Testing view switch:", viewType);
            // timeout to avoid click debounce
            setTimeout(function () {
                const target = document.querySelector(
                    `nav.o_cp_switch_buttons > button.o_switch_view.o_${viewType}`
                );
                if (target) {
                    triggerClick(target, `${viewType} view switcher`);
                }
            }, 250);
            await waitForCondition(() => {
                return document.querySelector(`.o_switch_view.o_${viewType}.active`) !== null;
            });
            await testStudio();
            await testFilters();
        }
    }

    /**
     * Test a menu item by:
     *  1 - clikcing on the menuItem
     *  2 - Orchestrate the view switch
     *
     *  @param {DomElement} element: the menu item
     *  @returns {Promise}
     */
    async function testMenuItem(element) {
        const menuDescription = element.innerText.trim() + " " + element.dataset.menuXmlid;
        console.log("Testing menu", menuDescription);
        testedMenus.push(element.dataset.menuXmlid);
        if (BLACKLISTED_MENUS.includes(element.dataset.menuXmlid)) {
            return Promise.resolve(); // Skip black listed menus
        }
        const startActionCount = actionCount;
        await triggerClick(element, `menu item "${element.innerText.trim()}"`);
        let isModal = false;
        return waitForCondition(function () {
            // sometimes, the app is just a modal that needs to be closed
            const $modal = $('.modal[role="dialog"]');
            if ($modal.length > 0) {
                const closeButton = document.querySelector("header > button.btn-close");
                if (closeButton) {
                    closeButton.focus();
                    triggerClick(closeButton, "modal close button");
                } else {
                    $modal.modal("hide");
                }
                isModal = true;
                return true;
            }
            return startActionCount !== actionCount;
        })
            .then(() => {
                if (!isModal) {
                    return testStudio();
                }
            })
            .then(() => {
                if (!isModal) {
                    return testFilters();
                }
            })
            .then(() => {
                if (!isModal) {
                    return testViews();
                }
            })
            .catch((err) => {
                console.error("Error while testing", menuDescription);
                return Promise.reject(err);
            });
    }

    /**
     * Test an "App" menu item by orchestrating the following actions:
     *  1 - clicking on its menuItem
     *  2 - clicking on each view
     *  3 - clicking on each menu
     *  3.1  - clicking on each view
     * @param {DomElement} element: the App menu item
     * @returns {Promise}
     */
    async function testApp(element) {
        console.log("Testing app menu:", element.dataset.menuXmlid);
        testedApps.push(element.dataset.menuXmlid);
        await testMenuItem(element);
        if (appsMenusOnly === true) {
            return;
        }
        menuIndex = 0;
        subMenuIndex = 0;
        let menu = await getNextMenu();
        while (menu) {
            await testMenuItem(menu);
            menu = await getNextMenu();
        }
    }

    /**
     * Main function that starts orchestration of tests
     */
    async function _clickEverywhere(xmlId) {
        ensureSetup();
        console.log("Starting ClickEverywhere test");
        console.log(`Odoo flavor: ${isEnterprise ? "Enterprise" : "Community"}`);
        const startTime = performance.now();
        testedApps = [];
        testedMenus = [];
        appIndex = 0;
        menuIndex = 0;
        subMenuIndex = 0;
        try {
            let app;
            if (xmlId) {
                if (isEnterprise) {
                    app = document.querySelector(`a.o_app.o_menuitem[data-menu-xmlid="${xmlId}"]`);
                } else {
                    await triggerClick(
                        document.querySelector(".o_navbar_apps_menu .dropdown-toggle")
                    );
                    app = document.querySelector(
                        `.o-dropdown--menu .dropdown-item[data-menu-xmlid="${xmlId}"]`
                    );
                }
                if (!app) {
                    throw new Error(`No app found for xmlid ${xmlId}`);
                }
                await testApp(app);
            } else {
                while ((app = await getNextApp())) {
                    await testApp(app);
                }
            }

            console.log(`Test took ${(performance.now() - startTime) / 1000} seconds`);
            console.log(`Successfully tested ${testedApps.length} apps`);
            console.log(`Successfully tested ${testedMenus.length - testedApps.length} menus`);
            if (isStudioInstalled) {
                console.log(`Successfully tested ${studioCount} views in Studio`);
            }
            console.log("test successful");
        } catch (err) {
            console.log(`Test took ${(performance.now() - startTime) / 1000} seconds`);
            console.error(err || "test failed");
        }
        console.log(testedApps);
        console.log(testedMenus);
    }

    function clickEverywhere(xmlId, light) {
        appsMenusOnly = light;
        setTimeout(_clickEverywhere, 1000, xmlId);
    }

    exports.clickEverywhere = clickEverywhere;
})(window);
