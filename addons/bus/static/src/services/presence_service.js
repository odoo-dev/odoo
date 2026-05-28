import { EventBus } from "@odoo/owl";
import { registry } from "@web/core/registry";

export const presenceService = {
    start(env) {
        const LOCAL_STORAGE_PREFIX = "presence";
        const bus = new EventBus();
        let isOdooFocused = true;
        let lastPresenceTime =
            localStorage.getItem(`${LOCAL_STORAGE_PREFIX}.lastPresence`) || luxon.DateTime.now().ts;

        function onPresence() {
            lastPresenceTime = luxon.DateTime.now().ts;
            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}.lastPresence`, lastPresenceTime);
            bus.trigger("presence");
        }

        function onFocusChange(isFocused) {
            try {
                isFocused = parent.document.hasFocus();
            } catch {
                // noop
            }
            isOdooFocused = isFocused;
            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}.focus`, isOdooFocused);
            if (isOdooFocused) {
                lastPresenceTime = luxon.DateTime.now().ts;
                env.bus.trigger("window_focus", isOdooFocused);
            }
        }

        function onStorage({ key, newValue }) {
            if (key === `${LOCAL_STORAGE_PREFIX}.focus`) {
                isOdooFocused = JSON.parse(newValue);
                env.bus.trigger("window_focus", newValue);
            }
            if (key === `${LOCAL_STORAGE_PREFIX}.lastPresence`) {
                lastPresenceTime = JSON.parse(newValue);
                bus.trigger("presence");
            }
        }
        window.addEventListener("storage", onStorage);
        window.addEventListener("focus", () => onFocusChange(true));
        window.addEventListener("blur", () => onFocusChange(false));
        window.addEventListener("pagehide", () => onFocusChange(false));
        window.addEventListener("click", onPresence, true);
        window.addEventListener("keydown", onPresence, true);

        return {
            bus,
            getLastPresence() {
                return lastPresenceTime;
            },
            isOdooFocused() {
                return isOdooFocused;
            },
            getInactivityPeriod() {
                return luxon.DateTime.now().ts - this.getLastPresence();
            },
        };
    },
};

registry.category("services").add("presence", presenceService);
