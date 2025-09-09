import { App } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { _t } from "@web/core/l10n/translation";
import { rpcBus } from "@web/core/network/rpc";
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
        // debugger;
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

const calledRPC = {};

function onRPCRequest({ detail }) {
    calledRPC[detail.data.id] = detail.url;
}

function onRPCResponse({ detail }) {
    delete calledRPC[detail.data.id];
    // if (detail.error) {
    //     errorRPC = { ...detail };
    // }
}

/// END COPY .///////
// NOT A FULL COPY BUT TO REFACTOR ...

async function waitForCondition(stopCondition) {
    const interval = 25;
    let timeLimit = 30000;

    function hasPendingRPC() {
        return Object.keys(calledRPC).length > 0;
    }
    function hasScheduledTask() {
        let size = 0;
        for (const app of App.apps) {
            size += app.scheduler.tasks.size;
        }
        return size > 0;
    }

    while (!stopCondition() || hasPendingRPC() || hasScheduledTask()) {
        if (timeLimit <= 0) {
            // debugger;
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
    rpcBus.addEventListener("RPC:REQUEST", onRPCRequest);
    rpcBus.addEventListener("RPC:RESPONSE", onRPCResponse);
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
                triggerClick(target);
            }
        }, 250);
        await waitForCondition(
            () => document.querySelector(`.o_switch_view.o_${viewType}.active`) !== null
        );
        if (viewType === "list") {
            //click on all rows
            const number = document.querySelector(".o_view_sample_data")
                ? 0
                : document.querySelectorAll(".o_data_row").length;
            for (const i of [...Array(number).keys()]) {
                const row = document.querySelectorAll(".o_data_row")[i];
                // Open the form
                let startActionCount = actionCount;
                if (document.querySelector(".o_list_record_open_form_view")) {
                    await triggerClick(row.querySelector(".o_list_record_open_form_view"));
                } else {
                    await triggerClick(row.querySelector(".o_data_cell"));
                }
                await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded

                // FIXME:: Check why there is sometimes that we don't open the view !!!
                if (document.querySelector(".o_back_button")) {
                    // Go back to the list
                    startActionCount = actionCount;
                    await triggerClick(document.querySelector(".o_back_button"));
                    await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded
                }
            }
        } else {
            const number = document.querySelector(".o_view_sample_data")
                ? 0
                : document.querySelectorAll(".o_kanban_record:not(.o_kanban_ghost).cursor-pointer")
                      .length;
            for (const i of [...Array(number).keys()]) {
                const card = document.querySelectorAll(
                    ".o_kanban_record:not(.o_kanban_ghost).cursor-pointer"
                )[i];
                // Open the form
                let startActionCount = actionCount;
                await triggerClick(card);
                await waitForCondition(() => startActionCount !== actionCount); // wait for action to be loaded

                // Mayube the click does nothing !!!
                // FIXME: Check why there is sometimes that we don't open the view !!!
                if (document.querySelector(".o_back_button")) {
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
