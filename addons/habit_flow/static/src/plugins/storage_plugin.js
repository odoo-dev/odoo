import { Plugin } from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { services } from "@web/core/services";

export class StoragePlugin extends Plugin {
    static id = "habit_flow.storage";
    static sequence = 10;

    readJSON(key, fallbackValue) {
        try {
            const value = browser.localStorage.getItem(key);
            return value ? JSON.parse(value) : fallbackValue;
        } catch (error) {
            browser.console.warn("HabitFlow ignored invalid localStorage data.", error);
            browser.localStorage.removeItem(key);
            return fallbackValue;
        }
    }

    writeJSON(key, value) {
        try {
            browser.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            browser.console.warn("HabitFlow could not save local data.", error);
        }
    }

    remove(key) {
        browser.localStorage.removeItem(key);
    }
}

services.add(StoragePlugin);
