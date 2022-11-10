/** @odoo-module */

import { registry } from "@web/core/registry";

class SoundEffects {
    constructor(env) {
        this.soundEffects = {
            channelJoin: { defaultVolume: 0.3, path: "/mail/static/src/audio/channel_01_in" },
            channelLeave: { path: "/mail/static/src/audio/channel_04_out" },
            deafen: { defaultVolume: 0.15, path: "/mail/static/src/audio/deafen_new_01" },
            incomingCall: { defaultVolume: 0.15, path: "/mail/static/src/audio/call_02_in_" },
            memberLeave: { defaultVolume: 0.5, path: "/mail/static/src/audio/channel_01_out" },
            mute: { defaultVolume: 0.2, path: "/mail/static/src/audio/mute_1" },
            newMessage: { path: "/mail/static/src/audio/dm_02" },
            pushToTalkOn: { defaultVolume: 0.05, path: "/mail/static/src/audio/ptt_push_1" },
            pushToTalkOff: { defaultVolume: 0.05, path: "/mail/static/src/audio/ptt_release_1" },
            screenSharing: { defaultVolume: 0.5, path: "/mail/static/src/audio/share_02" },
            undeafen: { defaultVolume: 0.15, path: "/mail/static/src/audio/undeafen_new_01" },
            unmute: { defaultVolume: 0.2, path: "/mail/static/src/audio/unmute_1" },
        };
    }
    /**
     * @param {String} param0 soundEffectName
     * @param {Object} param1
     * @param {boolean} [param1.loop] true if we want to make the audio loop, will only stop if stop() is called
     * @param {float} [param1.volume] the volume percentage in decimal to play this sound.
     *   If not provided, uses the default volume of this sound effect.
     */
    play(soundEffectName, { loop = false, volume } = {}) {
        if (typeof Audio === "undefined") {
            return;
        }
        const soundEffect = this.soundEffects[soundEffectName];
        if (!soundEffect) {
            return;
        }
        console.log("play sound effect", soundEffect);
        if (!soundEffect.audio) {
            const audio = new window.Audio();
            const ext = audio.canPlayType("audio/ogg; codecs=vorbis") ? ".ogg" : ".mp3";
            audio.src = soundEffect.path + ext;
            soundEffect.audio = audio;
        }
        soundEffect.audio.pause();
        soundEffect.audio.currentTime = 0;
        soundEffect.audio.loop = loop;
        soundEffect.audio.volume = volume ?? soundEffect.defaultVolume ?? 1;
        Promise.resolve(soundEffect.audio.play()).catch(() => {});
    }
    /**
     * Resets the audio to the start of the track and pauses it.
     * @param {String} [soundEffectName]
     */
    stop(soundEffectName) {
        const soundEffect = this.soundEffects[soundEffectName];
        if (soundEffect) {
            soundEffect.audio.pause();
            soundEffect.audio.currentTime = 0;
        } else {
            for (const soundEffect of this.soundEffects.values()) {
                if (soundEffect.audio) {
                    soundEffect.audio.pause();
                    soundEffect.audio.currentTime = 0;
                }
            }
        }
    }
}

export const soundEffects = {
    start(env) {
        return new SoundEffects(env);
    },
};

registry.category("services").add("mail.soundEffects", soundEffects);
