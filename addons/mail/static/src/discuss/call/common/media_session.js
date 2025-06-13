import { Component, onMounted, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class MediaSession extends Component {
    static props = [];
    static template = "discuss.MediaSession";

    setup() {
        super.setup();
        this.rtc = useService("discuss.rtc");
        const mediaSession = navigator.mediaSession;
        if (!mediaSession) {
            return;
        }

        mediaSession.setActionHandler("play", () => {
            this.rtc.toggleDeafen();
        });
        mediaSession.setActionHandler("pause", () => {
            this.rtc.toggleDeafen();
        });
        mediaSession.setActionHandler("togglemicrophone", () => {
            this.rtc.toggleMicrophone();
        });
        this.audioRef = useRef("audio");
        onMounted(() => {
            /**
             * @type {HTMLAudioElement}
             */
            const audio = this.audioRef.el;
            audio.src =
                "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
            audio.loop = true;
            audio.load();
            audio.pause();
        });
        this.env.bus.addEventListener("RTC-SERVICE:CALL_START", async () => {
            try {
                await this.audioRef.el?.play();
            } catch (error) {
                console.log(error);
                return;
            }
            const channel = this.rtc.channel;
            mediaSession.metadata = new MediaMetadata({
                title: "Odoo", // should probably be the name of the db or something similar
                artist: "Discuss Call",
                album: channel.name,
                artwork: [
                    {
                        src: channel.avatarUrl,
                        sizes: "128x128",
                        type: "image/png",
                    },
                ],
            });
            mediaSession.setPositionState({ duration: Infinity });
            mediaSession.playbackState = "playing";
        });
        this.env.bus.addEventListener("RTC-SERVICE:CALL_END", () => {
            mediaSession.playbackState = "none";
            mediaSession.metadata = null;
            this.audioRef.el?.pause();
        });
        this.env.bus.addEventListener("RTC-SERVICE:DEAF_CHANGED", ({ detail: { is_deaf } }) => {
            console.log("MediaSession deaf changed", is_deaf);
            mediaSession.playbackState = is_deaf ? "paused" : "playing";
            console.log(mediaSession.playbackState);
        });
        this.env.bus.addEventListener("RTC-SERVICE:MIC_CHANGED", ({ detail: { is_muted } }) => {
            mediaSession.setMicrophoneActive(!is_muted);
        });
    }
}

export const mediaSessionService = {
    dependencies: [],
    start() {
        registry
            .category("main_components")
            .add("discuss.MediaSession", { Component: MediaSession });
    },
};

registry.category("services").add("discuss.media_session", mediaSessionService);
