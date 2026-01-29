import { onChange } from "@mail/utils/common/misc";

import { _t } from "@web/core/l10n/translation";

export const MUTE_SUGGESTION_CONFIG = {
    armingDelay: 1200,
    activeDuration: 4000,
    cooldownDuration: 60000,
};

export function setupMuteSuggestion(rtc) {
    const session = rtc.selfSession;

    if (!session) {
        return () => {};
    }

    const MUTE_SUGGESTION_ID = "discuss_call_mute_suggestion";
    const MUTE_BUTTON_SELECTOR = ".o-discuss-CallActionList button#mute";
    let timers = {};
    let isDismissed;

    onChange(session, ["isTalking", "is_muted"], () => {
        if (!session.is_muted) {
            cleanup();
            isDismissed = false;
            return;
        }
        if (timers.cooldown || isDismissed) {
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
    });

    function startCooldown() {
        timers.visible = setTimeout(() => {
            hideSuggestion();
            timers.visible = null;
            timers.cooldown = setTimeout(() => {
                timers.cooldown = null;
            }, MUTE_SUGGESTION_CONFIG.cooldownDuration);
        }, MUTE_SUGGESTION_CONFIG.activeDuration);
    }

    function showSuggestion() {
        timers.arming = null;
        rtc.addCallSuggestion({
            id: MUTE_SUGGESTION_ID,
            targetSelector: MUTE_BUTTON_SELECTOR,
            text: _t("Are you talking? Your mic is off. Click the mic to turn it on."),
            fallbackText: _t("Are you talking? Your mic is off. Unmute to speak."),
            onDismiss: () => {
                isDismissed = true;
                cleanup();
            },
            delay: MUTE_SUGGESTION_CONFIG.activeDuration,
        });
        startCooldown();
    }

    function hideSuggestion() {
        rtc.removeCallSuggestion(MUTE_SUGGESTION_ID);
    }

    function cleanup() {
        Object.values(timers).forEach(clearTimeout);
        timers = {};
        hideSuggestion();
    }

    return cleanup;
}
