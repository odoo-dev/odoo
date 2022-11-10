/** @odoo-module */

import { ChannelMember } from "@mail/new/core/channel_member_model";

/**
 * @class Partner
 */
export class RtcSession {
    // Server data
    isCameraOn;
    id;
    isDeaf;
    isSelfMuted;
    isScreenSharingOn;
    isOwnSession;
    partner;
    // Client data
    audioElement;
    audioStream;
    isAudioInError;
    localVolume;
    isTalking;
    videoStream;
    connectionRecoveryTimeout;
    connectionState;
    isCurrentUserInitiatorOfConnectionOffer; // maybe not necessary
    localCandidateType;
    remoteCandidateType;
    // "relational data"
    channelId;
    channelMemberId;
    calledChannels;
    callParticipantCards;
    rtc; // means that this is the rtc session of the current user and rtc is active
    rtcDataChannel; // maybe not necessary as it is stored in rtc service
    rtcPeerConnection; // maybe not necessary as it is stored in rtc service

    /**
     * @param {import("@mail/new/core/messaging").Messaging['state']} state
     * @param {Object} data
     * @returns {RtcSession}
     */
    static insert(state, data) {
        let rtcSession;
        if (state.rtcSessions.has(data.id)) {
            rtcSession = state.rtcSessions.get(data.id);
        } else {
            rtcSession = new RtcSession();
            rtcSession._state = state;
        }
        rtcSession.update(data);
        state.rtcSessions.set(rtcSession.id, rtcSession);
        // return reactive version
        return state.rtcSessions.get(rtcSession.id);
    }
    static delete(state, id) {
        const session = state.rtcSessions.get(id);
        if (session) {
            state.threads[session.channelId]?.rtcSessions.delete(id);
            session.reset();
        }
        state.rtcSessions.delete(id);
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
        this.isOwnSession = this.channelMember?.partnerId === this._state.user.partnerId;
    }
    get channelMember() {
        return this._state.channelMembers[this.channelMemberId];
    }
    get channel() {
        return this._state.threads[this.channelId];
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
        if (this.isOwnSession) {
            return;
        }
    }

    //----------------------------------------------------------------------
    // Public
    //----------------------------------------------------------------------

    /**
     * Updates the RtcSession with a new track.
     *
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

    /**
     * restores the session to its default values
     */
    reset() {
        this._removeAudio();
        this.removeVideo();
    }

    /**
     * cleanly removes the video stream of the session
     */
    removeVideo() {
        if (this.videoStream) {
            for (const track of this.videoStream.getTracks() || []) {
                track.stop();
            }
        }
        this.videoStream = undefined;
    }

    //----------------------------------------------------------------------
    // Private
    //----------------------------------------------------------------------

    /**
     * cleanly removes the audio stream of the session
     *
     * @private
     */
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
