import { Record } from "@mail/model/export";

import { _t } from "@web/core/l10n/translation";

export const MUTE_SUGGESTION_CONFIG = {
    armingDelay: 1200,
    activeDuration: 4000,
    cooldownDuration: 60000,
};
export const MUTE_SUGGESTION_TEXT = _t(
    "Are you talking? Your mic is off. Click the mic to turn it on."
);
export const MUTE_SUGGESTION_NOTIFICATION_TEXT = _t(
    "Are you talking? Your mic is off. Unmute to speak."
);
export const MUTE_SUGGESTION_NOTIFICATION_ID = "discuss_call_mute_suggestion";

export function setupMuteSuggestion(store) {
    const rtc = store.env.services["discuss.rtc"];
    const session = rtc.selfSession;

    if (!session) {
        return () => {};
    }

    let timers = {};
    const stopOnChanges = [];

    const onSessionUpdate = () => {
        if (!session.is_muted) {
            cleanup();
            rtc.muteSuggestion.dismissed = false;
            return;
        }
        if (timers.cooldown || rtc.muteSuggestion.dismissed || rtc.muteSuggestion.isVisible) {
            return;
        }
        if (rtc.microphonePermission === "granted" && session.is_muted && session.isTalking) {
            if (!timers.arming) {
                timers.arming = setTimeout(showSuggestion, MUTE_SUGGESTION_CONFIG.armingDelay);
            }
        } else {
            if (timers.arming) {
                clearTimeout(timers.arming);
                timers.arming = null;
            }
        }
    };
    stopOnChanges.push(Record.onChange(session, "isTalking", onSessionUpdate));
    stopOnChanges.push(Record.onChange(session, "is_muted", onSessionUpdate));

    function startCooldown() {
        timers.display = setTimeout(() => {
            rtc.hideMuteSuggestion();
            timers.display = null;
            timers.cooldown = setTimeout(() => {
                timers.cooldown = null;
            }, MUTE_SUGGESTION_CONFIG.cooldownDuration);
        }, MUTE_SUGGESTION_CONFIG.activeDuration);
    }

    function showSuggestion() {
        timers.arming = null;
        rtc.showMuteSuggestion();
        startCooldown();
    }

    function cleanup() {
        Object.values(timers).forEach(clearTimeout);
        timers = {};
        rtc.hideMuteSuggestion();
    }

    return () => {
        stopOnChanges.forEach((stop) => stop?.());
        rtc.muteSuggestion.dismissed = false;
        cleanup();
    };
}
