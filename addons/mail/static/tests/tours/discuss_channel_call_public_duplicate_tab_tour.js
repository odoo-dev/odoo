import { registry } from "@web/core/registry";

/**
 * Tour that simulates duplicating a public meeting tab.
 *
 * When a tab is duplicated, the welcome page still appears (UPDATE_REMOTE
 * arrives too late to prevent it). The fix ensures that when the user clicks
 * "Join", joinCallWithDefaultSettings detects the remote state and skips
 * toggleCall, preserving the host's call instead of crashing.
 *
 * Flow: Welcome page → inject UPDATE_REMOTE → click Join → no crash → call renders.
 */
registry.category("web_tour.tours").add("discuss_channel_call_public_duplicate_tab_tour.js", {
    steps: () => [
        {
            content: "Close the video permission dialog",
            trigger: ".o_dialog .modal-header .btn-close",
            run: "click",
        },
        {
            content: "Simulate host tab by injecting UPDATE_REMOTE via BroadcastChannel",
            trigger: ".o-mail-WelcomePage",
            async run() {
                const rtcService = odoo.__WOWL_DEBUG__.root.env.services["discuss.rtc"];
                const store = odoo.__WOWL_DEBUG__.root.env.services["mail.store"];
                const channel = store.discuss.thread?.channel;
                if (!channel) {
                    console.error("No channel found in store");
                    return;
                }
                const sessionId = store.discuss.thread.rtc_session_ids[0]?.id;
                if (!sessionId) {
                    console.error("No RTC session found on the channel");
                    return;
                }
                const broadcastChannel = new BroadcastChannel("call_sync_state");
                broadcastChannel.postMessage({
                    type: "UPDATE_REMOTE",
                    hostedChannelId: channel.id,
                    hostedSessionId: sessionId,
                    changes: {
                        [sessionId]: {
                            is_muted: false,
                            is_deaf: false,
                        },
                    },
                });
                broadcastChannel.close();
                // Wait for the message to be processed by the RTC service
                await new Promise((r) => setTimeout(r, 500));
                if (!rtcService.isRemote) {
                    console.error("RTC service should be in remote mode after UPDATE_REMOTE");
                }
            },
        },
        {
            content: "Fill in guest name",
            trigger: "input[name='guest_name']",
            run: "edit Guest",
        },
        {
            content: "Click Join — triggers closeWelcomePage -> joinCallWithDefaultSettings",
            trigger: "button[title='Join Channel']",
            run: "click",
        },
        {
            content: "Call view renders (remote state preserved, no crash)",
            trigger: ".o-discuss-Call",
        },
        {
            content: "Disconnect button present (remote call controls work)",
            trigger: "button[title='Disconnect']",
        },
    ],
});
