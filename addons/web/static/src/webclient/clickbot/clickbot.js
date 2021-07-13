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
        "pos_adyen.menu_pos_adyen_account",
        "payment_odoo.menu_adyen_account",
        "payment_odoo.root_adyen_menu",
    ];

    const { isEnterprise } = odoo.info;
    let appsMenusOnly = false;
    let actionCount = 0;
    let viewUpdateCount = 0;

    let appIndex;
    let menuIndex;
    let subMenuIndex;
    let testedApps;
    let testedMenus;

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
        env.bus.on("ACTION_MANAGER:UI-UPDATED", null, () => {
            actionCount++;
        });

        const AbstractController = odoo.__DEBUG__.services["web.AbstractController"];
        AbstractController.include({
            start() {
                this.$el.attr("data-view-type", this.viewType);
                return this._super.apply(this, arguments);
            },
            async update() {
                await this._super(...arguments);
                viewUpdateCount++;
            },
        });

        // This test file is not respecting Odoo module dependencies.
        // The following module might not be loaded (eg. if mail is not installed).
        const DiscussWidgetModule = odoo.__DEBUG__.services["@mail/widgets/discuss/discuss"];
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
        await new Promise(setTimeout);
        await new Promise((r) => requestAnimationFrame(r));
    }

    /**
     * Wait a certain amount of time for a condition to occur
     *
     * @param {function} stopCondition a function that returns a boolean
     * @returns {Promise} that is rejected if the timeout is exceeded
     */
    function waitForCondition(stopCondition, tl = 10000) {
        return new Promise(function (resolve, reject) {
            const interval = 250;
            let timeLimit = tl;

            function checkCondition() {
                if (stopCondition()) {
                    resolve();
                } else {
                    timeLimit -= interval;
                    if (timeLimit > 0) {
                        // recursive call until the resolve or the timeout
                        setTimeout(checkCondition, interval);
                    } else {
                        console.error(
                            "Timeout, the clicked element took more than",
                            tl / 1000,
                            "seconds to load"
                        );
                        reject();
                    }
                }
            }
            setTimeout(checkCondition, interval);
        });
    }

    /**
     * Make sure the home menu is open (enterprise only)
     */
    async function ensureHomeMenu() {
        const homeMenu = document.querySelector(".o_home_menu");
        if (!homeMenu) {
            const menuToggle = document.querySelector("nav.o_main_navbar > a.o_menu_toggle.fa-th");
            await triggerClick(menuToggle, "home menu toggle button");
            await waitForCondition(() => document.querySelector(".o_home_menu"));
        }
    }

    /**
     * Make sure the apps menu is open (community only)
     */
    async function ensureAppsMenu() {
        const appsMenu = document.querySelector(".o_navbar_apps_menu .o_dropdown_menu");
        if (!appsMenu) {
            const toggler = document.querySelector(".o_navbar_apps_menu .o_dropdown_toggler");
            await triggerClick(toggler, "apps menu toggle button");
            await waitForCondition(() =>
                document.querySelector(".o_navbar_apps_menu .o_dropdown_menu")
            );
        }
    }

    /**
     * Return the next menu to test, and update the internal counters.
     *
     * @returns {DomElement}
     */
    async function getNextMenu() {
        const menus = document.querySelectorAll(
            ".o_menu_sections > .o_dropdown > .o_dropdown_toggler, .o_menu_sections > .o_dropdown_item"
        );
        if (menuIndex === menus.length) {
            menuIndex = 0;
            return; // all menus done
        }
        let menu = menus[menuIndex];
        if (menu.classList.contains("o_dropdown_toggler")) {
            // the current menu is a dropdown toggler -> open it and pick a menu inside the dropdown
            if (!menu.nextSibling) {
                // might already be opened if the last menu was blacklisted
                await triggerClick(menu, "menu toggler");
            }
            const dropdown = menu.nextSibling;
            if (!dropdown) {
                menuIndex = 0; // empty More menu has no dropdown (FIXME?)
                return;
            }
            const items = dropdown.querySelectorAll(".o_dropdown_item");
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
            apps = document.querySelectorAll(".o_navbar_apps_menu .o_dropdown_item");
        }
        const app = apps[appIndex];
        appIndex++;
        return app;
    }

    /**
     * Test filters
     * Click on each filter in the control pannel
     */
    async function testFilters() {
        if (appsMenusOnly === true) {
            return;
        }
        const filterMenuButton = document.querySelector(".o_control_panel .o_filter_menu > button");
        if (!filterMenuButton) {
            return;
        }
        // Open the filter menu dropdown
        await triggerClick(
            filterMenuButton,
            `toggling menu "${filterMenuButton.innerText.trim()}"`
        );

        const filterMenuItems = document.querySelectorAll(
            ".o_control_panel .o_filter_menu > ul > li.o_menu_item"
        );
        console.log("Testing", filterMenuItems.length, "filters");

        for (const filter of filterMenuItems) {
            const currentViewCount = viewUpdateCount;
            const filterLink = filter.querySelector("a");
            await triggerClick(filterLink, `filter "${filter.innerText.trim()}"`);
            if (filterLink.classList.contains("o_menu_item_parent")) {
                // If a fitler has options, it will simply unfold and show all options.
                // We then click on the first one.
                const firstOption = filter.querySelector(
                    ".o_menu_item_options > li.o_item_option > a"
                );
                console.log();
                await triggerClick(firstOption, `filter option "${firstOption.innerText.trim()}"`);
            }
            await waitForCondition(() => currentViewCount !== viewUpdateCount);
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
            await waitForCondition(
                () =>
                    document.querySelector(".o_action_manager > .o_action.o_view_controller")
                        .dataset.viewType === viewType
            );
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
        let menuTimeLimit = 10000;
        if (element.innerText.trim() === "Settings") {
            menuTimeLimit = 20000;
        }
        const startActionCount = actionCount;
        await triggerClick(element, `menu item "${element.innerText.trim()}"`);
        let isModal = false;
        return waitForCondition(function () {
            // sometimes, the app is just a modal that needs to be closed
            const $modal = $('.modal[role="dialog"][open="open"]');
            if ($modal.length > 0) {
                const closeButton = document.querySelector("header > button.close");
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
        }, menuTimeLimit)
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
                        document.querySelector(".o_navbar_apps_menu .o_dropdown_toggler")
                    );
                    app = document.querySelector(
                        `.o_navbar_apps_menu .o_dropdown_item[data-menu-xmlid="${xmlId}"]`
                    );
                }
                if (!app) {
                    throw new Error(`No app found for xmlid ${xmlId}`);
                }
                await testApp(app);
            } else {
                app = await getNextApp();
                while (app) {
                    await testApp(app);
                    app = await getNextApp();
                }
            }
            console.log("Test took", (performance.now() - startTime) / 1000, "seconds");
            console.log("Successfully tested", testedApps.length, " apps");
            console.log("Successfully tested", testedMenus.length - testedApps.length, "menus");
            console.log("test successful");
        } catch (err) {
            console.log("Test took", (performance.now() - startTime) / 1000, "seconds");
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
