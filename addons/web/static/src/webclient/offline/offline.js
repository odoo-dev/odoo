import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";

function runPopulateIndexedDB() {
    return {
        type: "item",
        description: _t("[WIP] Populate IndexedDB for All Apps"),
        callback: () => {
            populateIndexedDBIframe();
        },
        sequence: 100,
        section: "offline",
    };
}

async function populateIndexedDBIframe() {
    var ifrm = document.createElement("iframe");
    ifrm.setAttribute("src", "/odoo/populate-offline?debug=assets");
    ifrm.style.width = "1366px";
    ifrm.style.height = "768px";
    ifrm.style.zoom = "0.5";
    document.body.appendChild(ifrm);
}

function stopPopulateIndexedDB() {
    document.body.removeChild(document.querySelector("iframe"));
}

window.stopPopulateIndexedDB = stopPopulateIndexedDB;

registry.category("debug").category("default").add("populateIndexDB", runPopulateIndexedDB);

let actionCount = 0;
//// COPY FROM clickbot, this need to be refactored later ////
const MOUSE_EVENTS = ["mouseover", "mouseenter", "mousedown", "mouseup", "click"];

/**
 * Returns a promise that resolves after the next animation frame.
 *
 * @returns {Promise}
 */
async function waitForNextAnimationFrame() {
    await new Promise(browser.setTimeout);
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
        if (elDescription) {
            browser.console.log(`Clicking on: ${elDescription}`);
        }
    } else {
        throw new Error(`No element "${elDescription}" found.`);
    }
    MOUSE_EVENTS.forEach((type) => {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
        target.dispatchEvent(event);
    });
    await waitForNextAnimationFrame();
}
function uiUpdate() {
    actionCount++;
}

/// END COPY .///////
// NOT A FULL COPY BUT TO REFACTOR ...

async function waitForCondition(stopCondition) {
    const interval = 25;
    let timeLimit = 30000;
    while (!stopCondition()) {
        if (timeLimit <= 0) {
            throw new Error("Timeout waiting for condition");
        }
        await new Promise((resolve) => browser.setTimeout(resolve, interval));
        timeLimit -= interval;
    }
}

///

/**
 * @param {import("@web/env").OdooEnv} env
 * @param {object} action
 */
async function populateIndexDB(env, action) {
    // Copy and modify of clickAll .. refactor needed !
    env.bus.addEventListener("ACTION_MANAGER:UI-UPDATED", uiUpdate);
    const apps = env.services.menu.getApps().filter((app) => app.actionOffline);
    for (const app of apps) {
        // Go Back to the App main menu
        // Only Enterprise for now !
        const homeMenuEl = document.querySelector("nav.o_main_navbar > a.o_menu_toggle");
        await triggerClick(homeMenuEl);
        await waitForCondition(() => document.querySelector("div.o_home_menu"));

        // Open the App
        const appEl = document.querySelector(`a.o_app.o_menuitem[data-menu-xmlid="${app.xmlid}"]`);
        const startActionCount = actionCount;
        await triggerClick(appEl);
        await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded

        // Open the menus !
        const menus = app.childrenTree.filter((m) => m.actionOffline);
        for (const menu of menus) {
            if (!menu.children.length) {
                // The menu don't have sub-menu, we can click on it
                const menuEl = document.querySelector(
                    `.o_menu_sections [data-menu-xmlid="${menu.xmlid}"]`
                );
                const startActionCount = actionCount;
                await triggerClick(menuEl);
                await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded
                await populateViewsForm(env);
            } else {
                // This is in the hope that there is no sub-sub-menu ...
                const menuChild = menu.childrenTree
                    .filter((m) => !m.children.length)
                    .concat(
                        menu.childrenTree
                            .filter((m) => m.children.length)
                            .map((m) => m.childrenTree)
                            .flat()
                    )
                    .filter((m) => m.actionOffline && !m.children.length);
                for (const child of menuChild) {
                    // The menu don't have sub-menu, we can click on it
                    const menuEl = document.querySelector(
                        `.o_menu_sections [data-menu-xmlid="${menu.xmlid}"]`
                    );
                    await triggerClick(menuEl);
                    await waitForCondition(() =>
                        document.querySelector(".o-overlay-container .o_popover.dropdown-menu")
                    );
                    const childEl = document.querySelector(
                        `.o-dropdown-item[data-menu-xmlid="${child.xmlid}"]`
                    );
                    const startActionCount = actionCount;
                    await triggerClick(childEl);
                    await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded
                    await populateViewsForm(env);
                }
            }
        }
    }
    parent.stopPopulateIndexedDB();
}

async function populateViewsForm(env) {
    const switchButtons = document.querySelectorAll(
        "button.o_switch_view.o_kanban, button.o_switch_view.o_list"
    );

    for (const switchButton of switchButtons) {
        // Only way to get the viewType from the switchButton
        const viewType = [...switchButton.classList]
            .find((cls) => cls !== "o_switch_view" && cls.startsWith("o_"))
            .slice(2);

        // timeout to avoid click debounce
        browser.setTimeout(function () {
            const target = document.querySelector(
                `nav.o_cp_switch_buttons > button.o_switch_view.o_${viewType}`
            );
            if (target) {
                triggerClick(target, `${viewType} view switcher`);
            }
        }, 250);
        await waitForCondition(
            () => document.querySelector(`.o_switch_view.o_${viewType}.active`) !== null
        );
        if (viewType === "list") {
            //click on all rows
            const number = document.querySelectorAll(".o_data_row").length;
            for (const i of [...Array(number).keys()]) {
                const row = document.querySelectorAll(".o_data_row")[i];
                // Open the form
                let startActionCount = actionCount;
                await triggerClick(row.querySelector(".o_data_cell"));
                await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded

                if (document.querySelector(".o_form_view")) {
                    // Go back to the list
                    startActionCount = actionCount;
                    await triggerClick(document.querySelector(".o_back_button"));
                    await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded
                }
            }
        } else {
            const number = document.querySelectorAll(".o_kanban_record.cursor-pointer").length;
            for (const i of [...Array(number).keys()]) {
                const card = document.querySelectorAll(".o_kanban_record.cursor-pointer")[i];
                // Open the form
                let startActionCount = actionCount;
                await triggerClick(card);
                await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded

                if (document.querySelector(".o_form_view")) {
                    // Go back to the kanban
                    startActionCount = actionCount;
                    await triggerClick(document.querySelector(".o_back_button"));
                    await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded
                }
            }
        }
    }
}

registry.category("actions").add("populate-offline", populateIndexDB);
