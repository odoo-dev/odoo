import {
    Component,
    onWillUnmount,
    useState,
    proxy,
    signal,
    computed,
    useEffect,
    effect,
} from "@odoo/owl";
import { useHotkey } from "@web/core/hotkeys/hotkey_hook";
import { CallDebriefTimeline } from "@mail/views/fields/call_debrief/call_debrief_timeline";
import { CallDebriefMediaControls } from "@mail/views/fields/call_debrief/call_debrief_media_controls";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { _t } from "@web/core/l10n/translation";

export class CallDebrief extends Component {
    static template = "mail.CallDebrief";
    static components = { CallDebriefTimeline, CallDebriefMediaControls };

    setup() {
        this.callDurationSeconds = 0;
        this.playbackRates = [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 3];
        this.skipNextTimeUpdate = false;
        this.isSwitchingSegment = false;

        /** @type {import("@odoo/owl").Signal<HTMLMediaElement>} */
        this.mediaPlayer = signal(null);

        this.volume = signal(1);
        this.isMuted = computed(() => this.volume() === 0);

        this.orm = useService("orm");
        this.playback = useState({
            currentTime: 0,
            isPlaying: false,
            playbackRate: 1,
        });
        this.media = useState({
            mediaSegments: [],
            currentSegment: undefined,
        });
        this.ui = useState({
            error: "",
            feedback: { text: "", id: Date.now() },
        });

        this.onMediaLoadedCallback = null;

        // Tracks active record ID to bypass this.props update lag during async paging
        this.activeResId = this.props.record.resId;

        this.virtualClockId = null;
        this.lastClockTime = null;

        effect(() => {
            const _ = this.props.record.resId;
            const __ = this.props.record.data[this.props.name];
            this.activeResId = this.props.record.resId;
            this._loadData(this.props);
        });

        useHotkey("k", () => this.togglePlay(), { global: true });
        useHotkey("space", () => this.togglePlay(), { global: true });
        useHotkey("j", () => this.seekRelative(-5), { global: true, allowRepeat: true });
        useHotkey("l", () => this.seekRelative(5), { global: true, allowRepeat: true });
        useHotkey("arrowleft", () => this.seekRelative(-5), { global: true, allowRepeat: true });
        useHotkey("arrowright", () => this.seekRelative(5), { global: true, allowRepeat: true });
        useHotkey("m", () => this.toggleMute(), { global: true });
        useHotkey("shift+>", () => this.adjustPlaybackRate(1), { global: true });
        useHotkey("shift+<", () => this.adjustPlaybackRate(-1), { global: true });

        onWillUnmount(() => {
            clearTimeout(this.feedbackTimeout);
            this._stopVirtualClock();
        });

        // Effect for hardware media synchronization
        useEffect(() => {
            const media = this.mediaPlayer();
            if (media) {
                media.playbackRate = this.playback.playbackRate;
                media.volume = this.volume();
                media.muted = this.isMuted();
            }
        });
    }

    _startVirtualClock() {
        if (this.virtualClockId) {
            return;
        }
        this.lastClockTime = performance.now();
        const tick = (now) => {
            if (!this.playback.isPlaying) {
                this.virtualClockId = null;
                return;
            }
            const delta = (now - this.lastClockTime) / 1000;
            this.lastClockTime = now;

            if (!this.media.currentSegment) {
                this.playback.currentTime += delta * this.playback.playbackRate;
                if (this.playback.currentTime >= this.callDurationSeconds) {
                    this.playback.currentTime = this.callDurationSeconds;
                    this._pause(_t("End of Media"));
                } else {
                    const targetSegment = this._findTargetSegment(this.playback.currentTime);
                    if (targetSegment && targetSegment.startSec <= this.playback.currentTime) {
                        this.setPlaybackTime({ timestamp: this.playback.currentTime, play: true });
                    }
                }
            }

            this.virtualClockId = requestAnimationFrame(tick);
        };
        this.virtualClockId = requestAnimationFrame(tick);
    }

    _stopVirtualClock() {
        if (this.virtualClockId) {
            cancelAnimationFrame(this.virtualClockId);
            this.virtualClockId = null;
        }
    }

    get hasMedia() {
        return this.media.mediaSegments.length > 0;
    }

    get hasTimeline() {
        return this.hasMedia;
    }

    get hasVideo() {
        return this.media.currentSegment?.type === "video";
    }

    onMediaError() {
        this.showFeedback(_t("Media Error"));
        console.warn("Media playback error. The format might not be supported by your browser.");
    }

    _initCallTiming(start, end) {
        if (!start || !end) {
            this.ui.error = _t(
                "CallDebrief widget needs start and end datetime from the parent record."
            );
            this._resetState();
            return false;
        }
        const callStartDate = typeof start === "string" ? deserializeDateTime(start) : start;
        const callEndDate = typeof end === "string" ? deserializeDateTime(end) : end;

        const duration = callEndDate.diff(callStartDate, "seconds").seconds;
        if (duration < 0) {
            this.ui.error = _t("Invalid call timing: end date is before start date.");
            this._resetState();
            return false;
        }
        this.callDurationSeconds = duration;
        return true;
    }

    _resetState() {
        this.media.mediaSegments = [];
        this.media.currentSegment = undefined;
        this.playback.currentTime = 0;
        this._stopVirtualClock();
    }

    async _loadData(props) {
        const initialResId = props.record.resId;
        this.ui.error = "";
        this.playback.isPlaying = false;
        this._stopVirtualClock();
        this.media.currentSegment = undefined;
        this.media.mediaSegments = [];

        const start = props.record.data[props.callStartDateField];
        const end = props.record.data[props.callEndDateField];

        if (!this._initCallTiming(start, end)) {
            return;
        }

        const artifactData = props.record.data[props.name];
        let artifactIds = [];
        if (artifactData && artifactData.currentIds) {
            artifactIds = artifactData.currentIds;
        } else if (Array.isArray(artifactData)) {
            artifactIds = artifactData;
        }

        if (!artifactIds.length) {
            return;
        }

        const fieldsToRead = this._getArtifactFields();

        let artifacts;
        try {
            artifacts = await this.orm.read("mail.call.artifact", artifactIds, fieldsToRead);
        } catch (e) {
            if (this.activeResId !== initialResId) {
                return;
            }
            this.ui.error = _t("Could not load call recordings");
            console.error(e);
            return;
        }

        if (this.activeResId !== initialResId) {
            console.log("[CallDebrief _loadData] Aborted due to activeResId !== initialResId!");
            return;
        }

        if (!artifacts.length) {
            return;
        }

        const mediaIds = artifacts.flatMap((a) => a.media_id?.[0] ?? []);
        const attachmentData = await this.orm.read("ir.attachment", mediaIds, ["mimetype"]);

        if (this.activeResId !== initialResId) {
            return;
        }

        const mimeMap = Object.fromEntries(attachmentData.map((a) => [a.id, a.mimetype]));

        const segments = [];
        for (const art of artifacts) {
            const startSec = art.start_ms / 1000;
            if (art.media_id) {
                const mediaId = art.media_id[0];
                const mime = mimeMap[mediaId] || "";
                const isVideo = mime.startsWith("video/");
                const isAudio = mime.startsWith("audio/");

                if (isVideo || isAudio) {
                    const endSec = art.end_ms / 1000;
                    segments.push({
                        id: art.id,
                        mediaId: mediaId,
                        mediaUrl: `/web/content/${mediaId}`,
                        type: isVideo ? "video" : "audio",
                        startSec: startSec,
                        endSec: endSec,
                        duration: endSec - startSec,
                    });
                }
            }
        }
        segments.sort((a, b) => a.startSec - b.startSec);

        this.media.mediaSegments = segments;
        if (segments.length > 0) {
            this.media.currentSegment = segments[0];
        }

        return artifacts;
    }

    /**
     * Hook to provide fields to read from mail.call.artifact.
     * Overridden in AI module to add AI-specific fields.
     */
    _getArtifactFields() {
        return ["media_id", "start_ms", "end_ms"];
    }

    /**
     * Finds the appropriate media segment for the given timestamp or artifact ID.
     */
    _findTargetSegment(timestamp, artifactId) {
        if (artifactId) {
            return this.media.mediaSegments.find((s) => s.id === artifactId);
        }

        let nextSegment;
        for (const segment of this.media.mediaSegments) {
            if (timestamp >= segment.startSec && timestamp < segment.endSec) {
                return segment; // Exact match found
            }
            // Track the closest upcoming segment if we fall in a gap
            if (segment.startSec > timestamp) {
                if (!nextSegment || segment.startSec < nextSegment.startSec) {
                    nextSegment = segment;
                }
            }
        }
        return nextSegment;
    }

    /**
     * Applies the target segment, timeline position, and play state to the <video>/<audio> element.
     */
    _alignMediaElement(targetSegment, relativeTime, autoplay, originalOptions) {
        if (this.media.currentSegment !== targetSegment) {
            this.isSwitchingSegment = true;
            this.media.currentSegment = targetSegment;
            this.onMediaLoadedCallback = () => {
                this.isSwitchingSegment = false;
                const mediaPlayer = this.mediaPlayer();
                if (mediaPlayer) {
                    mediaPlayer.currentTime = relativeTime;
                    if (autoplay) {
                        mediaPlayer.play().catch(() => {});
                    }
                }
            };
        } else {
            const mediaPlayer = this.mediaPlayer();
            if (mediaPlayer) {
                mediaPlayer.currentTime = relativeTime;
                if (autoplay) {
                    mediaPlayer.play().catch(() => {});
                }
            } else {
                // We must defer seeking if the media element hasn't been rendered or loaded yet.
                this.onMediaLoadedCallback = () => this.setPlaybackTime(originalOptions);
            }
        }
    }

    /** Given a point in time decides which audio/video segment should we be playing,
     * and exactly where inside that file should I be?
     */
    setPlaybackTime(options = {}) {
        const {
            timestamp = this.playback.currentTime,
            play: autoplay = this.playback.isPlaying,
            artifactId,
        } = options;

        this.playback.currentTime = timestamp;

        if (!this.media.mediaSegments.length) {
            return;
        }

        const targetSegment = this._findTargetSegment(timestamp, artifactId);

        if (!targetSegment) {
            // Reached the end of all available media
            if (this.media.currentSegment) {
                this._pause(false);
                this.media.currentSegment = undefined;
            }
            return;
        }

        if (!artifactId && targetSegment.startSec > timestamp) {
            this.media.currentSegment = undefined;
            this._pauseMediaOnly();
            if (autoplay) {
                this.playback.isPlaying = true;
                this._startVirtualClock();
            }
            return;
        }

        const relativeTime = Math.max(0, this.playback.currentTime - targetSegment.startSec);
        this._alignMediaElement(targetSegment, relativeTime, autoplay, options);
    }

    _pauseMediaOnly() {
        const mediaPlayer = this.mediaPlayer();
        if (mediaPlayer) {
            mediaPlayer.pause();
        }
    }

    /**
     * Pauses the media element and optionally displays a feedback message.
     * @param {string|false} feedback - The text to display. Pass false to suppress feedback.
     */
    _pause(feedback = _t("Pause")) {
        this._pauseMediaOnly();
        this.playback.isPlaying = false;
        this._stopVirtualClock();
        if (feedback) {
            this.showFeedback(feedback);
        }
    }

    onTimeUpdate(ev) {
        if (!this.media.currentSegment || ev.target.seeking || this.isSwitchingSegment) {
            return;
        }
        if (this.skipNextTimeUpdate) {
            this.skipNextTimeUpdate = false;
            return;
        }

        const mediaTime = ev.target.currentTime;
        // Pre-emptively switch to next segment to ensure gapless playback
        if (mediaTime >= this.media.currentSegment.duration - 0.2) {
            this.onMediaEnded();
            return;
        }

        const globalTime = this.media.currentSegment.startSec + mediaTime;
        this.playback.currentTime = globalTime;
    }

    /**
     * Handles the end of the current media segment.
     * Transitions to the next segment if possible otherwise pauses. 
     */
    onMediaEnded() {
        if (this.isSwitchingSegment) {
            return;
        }
        this.isSwitchingSegment = true;
        this.playback.currentTime = this.media.currentSegment.endSec;
        this.media.currentSegment = undefined;
        this.isSwitchingSegment = false;
        
        if (this.playback.isPlaying) {
            this._startVirtualClock();
        }
    }

    _onMediaLoaded() {
        if (this.onMediaLoadedCallback) {
            this.onMediaLoadedCallback();
            this.onMediaLoadedCallback = null;
        }
    }

    adjustPlaybackRate(delta) {
        const currentRate = this.playback.playbackRate;
        let closestIndex = -1;
        let minDiff = Infinity;
        for (let i = 0; i < this.playbackRates.length; i++) {
            const diff = Math.abs(this.playbackRates[i] - currentRate);
            if (diff < minDiff) {
                minDiff = diff;
                closestIndex = i;
            }
        }
        if (closestIndex === -1) {
            return;
        }

        let newIndex = closestIndex + delta;
        newIndex = Math.max(0, Math.min(newIndex, this.playbackRates.length - 1));

        const newRate = this.playbackRates[newIndex];
        this.playback.playbackRate = newRate;
        this.showFeedback(`${newRate}x`);
    }

    showFeedback(text) {
        this.ui.feedback = { text, id: Date.now() };
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }
        this.feedbackTimeout = setTimeout(() => {
            this.ui.feedback.text = "";
        }, 750);
    }

    play() {
        if (this.playback.currentTime >= this.callDurationSeconds - 0.5) {
            this.showFeedback(_t("End of Media"));
            return;
        }
        if (this.playback.isPlaying) {
            return;
        }
        
        this.playback.isPlaying = true;
        this.showFeedback(_t("Play"));

        const media = this.mediaPlayer();
        if (this.media.currentSegment && media) {
            media.play().catch((e) => {
                this.playback.isPlaying = false;
                this.showFeedback(_t("Playback Error"));
            });
        } else {
            this._startVirtualClock();
        }
    }

    pause() {
        if (!this.playback.isPlaying) {
            return;
        }
        this._pause();
    }

    togglePlay() {
        if (this.playback.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    seekRelative(delta) {
        const newTime = Math.max(
            0,
            Math.min(this.callDurationSeconds, this.playback.currentTime + delta)
        );
        this.setPlaybackTime({ timestamp: newTime });
        const direction = delta > 0 ? "+" : "-";
        this.showFeedback(`${direction} ${Math.abs(delta)}s`);
    }

    setPlaybackRate(ev) {
        this.playback.playbackRate = parseFloat(ev.target.value);
    }

    adjustVolume(delta) {
        this.volume.set(Math.max(0, Math.min(1, this.volume() + delta)));
    }

    setVolume(ev) {
        this.volume.set(parseFloat(ev.target.value));
    }

    toggleMute() {
        if (this.isMuted()) {
            this.volume.set(0.5);
        } else {
            this.volume.set(0);
        }
        this.showFeedback(this.isMuted() ? _t("Muted") : _t("Unmuted"));
    }
}

export const callDebriefField = {
    component: CallDebrief,
    displayName: _t("Call Debrief"),
    supportedOptions: [
        {
            label: _t("Start Date Field"),
            name: "callStartDateField",
            type: "string",
        },
        {
            label: _t("End Date Field"),
            name: "callEndDateField",
            type: "string",
        },
    ],
    supportedTypes: ["one2many", "many2many"],
    extractProps: ({ options }) => ({
        callStartDateField: options.callStartDateField,
        callEndDateField: options.callEndDateField,
    }),
};

registry.category("fields").add("call_debrief", callDebriefField);
