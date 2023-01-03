/** @odoo-module */

import { ChannelMember } from "@mail/new/core/channel_member_model";
import { createLocalId } from "../core/thread_model.create_local_id";

export class RtcSession {
    // Server data
    isCameraOn;
    id;
    isDeaf;
    isSelfMuted;
    isScreenSharingOn;
    // Client data
    audioElement;
    audioStream;
    isAudioInError;
    localVolume;
    isTalking;
    videoStream;
    connectionState;
    // "relational data"
    channelId;
    channelMemberId;
    /** @type {RTCDataChannel} */
    dataChannel;
    /** @type {RTCPeerConnection} */
    peerConnection;

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {RtcSession}
     */
    static insert(state, data) {
        let session;
        if (state.rtcSessions[data.id]) {
            session = state.rtcSessions[data.id];
        } else {
            session = new RtcSession();
            session._state = state;
        }
        session.update(data);
        state.rtcSessions[session.id] = session;
        // return reactive version
        return state.rtcSessions[session.id];
    }

    static delete(state, id) {
        const session = state.rtcSessions[id];
        if (session) {
            delete state.threads[createLocalId("mail.channel", session.channelId)]?.rtcSessions[id];
            session.clear();
        }
        delete state.rtcSessions[id];
    }

    update(data) {
        const { channelMember, ...remainingData } = data;
        for (const key in remainingData) {
            this[key] = remainingData[key];
        }
        if (channelMember?.channel) {
            this.channelId = channelMember.channel.id;
        }
        if (channelMember) {
            ChannelMember.insert(this._state, channelMember);
            this.channelMemberId = channelMember.id;
        }
    }

    get channelMember() {
        return this._state.channelMembers[this.channelMemberId];
    }

    get channel() {
        return this._state.threads[createLocalId("mail.channel", this.channelId)];
    }

    /**
     * @returns {string}
     */
    get avatarUrl() {
        return this.channelMember?.avatarUrl;
    }

    get isMute() {
        return this.isSelfMuted || this.isDeaf;
    }

    /**
     * @returns {string}
     */
    get name() {
        return this.channelMember?.name;
    }

    /**
     * @returns {number} float
     */
    get volume() {
        if (this.audioElement) {
            return this.audioElement.volume;
        }
        return undefined;
    }

    /**
     * @param {number} volume
     */
    setVolume(volume) {
        /**
         * Manually updating the volume field as it will not update based on
         * the change of the volume property of the audioElement alone.
         */
        this.volume = volume;
        if (this.audioElement) {
            this.audioElement.volume = volume;
        }
    }

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * @param {Track} [track]
     * @param {Object} parm1
     * @param {boolean} parm1.mute
     * @param {number} parm1.volume
     */
    updateStream(track, { mute, volume } = {}) {
        const stream = new window.MediaStream();
        stream.addTrack(track);
        if (track.kind === "audio") {
            this._setAudio({ audioStream: stream, mute, volume });
        }
        if (track.kind === "video") {
            this.videoStream = stream;
        }
        console.log("updateStream", this.id);
    }

    clear() {
        this._removeAudio();
        this.removeVideo();
        this.dataChannel?.close();
        delete this.dataChannel;
        const peerConnection = this.peerConnection;
        if (peerConnection) {
            const RTCRtpSenders = peerConnection.getSenders();
            for (const sender of RTCRtpSenders) {
                try {
                    peerConnection.removeTrack(sender);
                } catch {
                    // ignore error
                }
            }
            for (const transceiver of peerConnection.getTransceivers()) {
                try {
                    transceiver.stop();
                } catch {
                    // transceiver may already be stopped by the remote.
                }
            }
            peerConnection.close();
            delete this.peerConnection;
        }
    }

    removeVideo() {
        if (this.videoStream) {
            for (const track of this.videoStream.getTracks() || []) {
                track.stop();
            }
        }
        this.videoStream = undefined;
    }

    _removeAudio() {
        if (this.audioStream) {
            for (const track of this.audioStream.getTracks() || []) {
                track.stop();
            }
        }
        if (this.audioElement) {
            this.audioElement.pause();
            try {
                this.audioElement.srcObject = undefined;
            } catch {
                // ignore error during remove, the value will be overwritten at next usage anyway
            }
        }
        this.audioStream = undefined;
        this.isAudioInError = false;
        this.isTalking = false;
    }

    /**
     * @param {Object} param0
     * @param {MediaStream} param0.audioStream
     * @param {boolean} param0.mute
     * @param {number} param0.volume
     */
    async _setAudio({ audioStream, mute, volume = 1 }) {
        const audioElement = this.audioElement || new window.Audio();
        try {
            audioElement.srcObject = audioStream;
        } catch {
            this.isAudioInError = true;
        }
        audioElement.load();
        audioElement.muted = mute;
        // Using both autoplay and play() as safari may prevent play() outside of user interactions
        // while some browsers may not support or block autoplay.
        audioElement.autoplay = true;
        this.audioElement = audioElement;
        this.audioStream = audioStream;
        this.isSelfMuted = false;
        this.isTalking = false;
        try {
            await audioElement.play();
            this.isAudioInError = false;
        } catch (error) {
            if (typeof error === "object" && error.name === "NotAllowedError") {
                // Ignored as some browsers may reject play() calls that do not
                // originate from a user input.
                return;
            }
            this.isAudioInError = true;
        }
    }
}
