/** @odoo-module **/

import {
    Component,
    useState,
    onWillStart,
    useRef,
    onWillUpdateProps,
    onMounted,
    onWillUnmount,
    useEffect,
} from "@odoo/owl";
import { formatDuration } from "./call_debrief_utils";
import { CallDebriefTimeline } from "./call_debrief_timeline";
import { CallDebriefMediaControls } from "./call_debrief_media_controls";
import { parseTimedText } from "./transcript_parser";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { deserializeDateTime } from "@web/core/l10n/dates";

export class CallDebrief extends Component {
    static template = "mail.CallDebrief";
    static props = {
        ...standardFieldProps,
        callStartDateField: { type: String },
        callEndDateField: { type: String },
        transcriptField: { type: String, optional: true },
    };

    static components = { CallDebriefTimeline, CallDebriefMediaControls };

    setup() {
        this.callDurationSeconds = 0;
        this.playbackRates = [0.25, 0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 3];
        this.skipNextTimeUpdate = false;

        this.mediaPlayerRef = useRef("mediaPlayer");
        this.transcriptContainerRef = useRef("transcriptContainer");
        this.highlightedLineRef = null;

        this.orm = useService("orm");
        this.state = useState({
            currentTime: 0,
            media: undefined, // Single media object { id, type, mediaUrl, ... }
            transcriptLines: [],
            plainTextTranscript: null,
            isPlaying: false,
            playbackRate: 1,
            volume: 1,
            isMuted: false,
            feedback: { text: "", id: Date.now() },
            error: "",
        });

        this.onMediaLoadedCallback = null;
        this.formatDuration = formatDuration;

        onWillStart(() => this._loadMediaAndTranscript(this.props));

        onWillUpdateProps(async (nextProps) => {
            const hasIdChanged = this.props.record.resId !== nextProps.record.resId;
            const hasMediaChanged =
                this.props.record.data[this.props.name] !== nextProps.record.data[nextProps.name];
            const hasTranscriptChanged =
                this.props.record.data[this.props.transcriptField] !==
                nextProps.record.data[nextProps.transcriptField];
            if (hasIdChanged || hasMediaChanged || hasTranscriptChanged) {
                await this._loadMediaAndTranscript(nextProps);
            }
        });

        onMounted(() => {
            window.addEventListener("keydown", this.onKeyDown);
        });

        onWillUnmount(() => {
            window.removeEventListener("keydown", this.onKeyDown);
            if (this.feedbackTimeout) {
                clearTimeout(this.feedbackTimeout);
            }
        });

        // Whenever the state (volume, speed...) changes, ensure the video player matches
        useEffect(
            () => {
                const media = this.mediaPlayerRef.el;
                if (media) {
                    media.playbackRate = this.state.playbackRate;
                    media.volume = this.state.volume;
                    media.muted = this.state.isMuted;
                }
            },
            () => [this.state.playbackRate, this.state.volume, this.state.isMuted, this.state.media]
        );
    }

    get hasMedia() {
        return !!this.state.media;
    }

    get hasVideo() {
        return this.state.media?.type === "video";
    }

    get hasTranscriptLines() {
        return this.state.transcriptLines.length > 0;
    }

    get hasPlainTextTranscript() {
        return !!this.state.plainTextTranscript;
    }

    get hasTranscript() {
        return this.hasTranscriptLines || this.hasPlainTextTranscript;
    }

    /**
     * Main function to load media and transcript from the database.
     * @param {Object} props - component props
     */
    async _loadMediaAndTranscript(props) {
        this.state.error = "";
        this.state.isPlaying = false;

        const start = props.record.data[props.callStartDateField];
        const end = props.record.data[props.callEndDateField];
        let transcriptText = props.record.data[props.transcriptField] ?? "";

        if (!this._initCallTiming(start, end)) {
            return;
        }

        const mediaData = props.record.data[props.name];
        transcriptText = transcriptText || "";

        let mediaObj = undefined;

        let attachmentId;
        if (Array.isArray(mediaData)) {
            attachmentId = mediaData[0];
        } else if (mediaData && typeof mediaData === "object") {
            attachmentId = mediaData.id;
        } else {
            attachmentId = mediaData;
        }

        // Handle Media
        if (attachmentId) {
            let attachment;
            try {
                [attachment] = await this.orm.read("ir.attachment", [attachmentId], ["mimetype"]);
            } catch {
                this.state.error = "Could not load media (Access Denied or Missing).";
                return;
            }

            if (attachment) {
                // Make sure we don't try to play PDFs
                const mimetype = attachment.mimetype || "";
                const isVideo = mimetype.startsWith("video/");
                const isAudio = mimetype.startsWith("audio/");

                if (!isVideo && !isAudio) {
                    this.state.error = "Unsupported media type: " + mimetype;
                } else {
                    const type = isVideo ? "video" : "audio";
                    mediaObj = {
                        id: attachmentId,
                        type: type,
                        mediaUrl: `/web/content/${attachmentId}`,
                        duration: this.callDurationSeconds,
                        callOffsetSec: 0,
                    };
                }
            } else {
                this.state.error = "Media attachment not found.";
            }
        }

        this._updateState(mediaObj, transcriptText);
    }

    onMediaError = () => {
        this.state.error =
            "Media playback error. The format might not be supported by your browser.";
    };

    /**
     * Resolves call timing (start/end and duration) from parent record.
     * @param {Object} start - start datetime
     * @param {Object} end - end datetime
     * @returns {boolean} true if timing is valid, false otherwise
     */
    _initCallTiming(start, end) {
        if (!start || !end) {
            this.state.error =
                "CallDebrief widget needs start and end datetime from the parent record.";
            this._resetState();
            return false;
        }
        const callStartDate = typeof start === "string" ? deserializeDateTime(start) : start;
        const callEndDate = typeof end === "string" ? deserializeDateTime(end) : end;

        const duration = callEndDate.diff(callStartDate, "seconds").seconds;
        if (duration < 0) {
            this.state.error = "Invalid call timing: end date is before start date.";
            this._resetState();
            return false;
        }
        this.callDurationSeconds = duration;

        return true;
    }

    /**
     * Reset all media-related state to a neutral "empty" configuration.
     */
    _resetState() {
        this.state.media = undefined;
        this.state.transcriptLines = [];
        this.state.plainTextTranscript = null;
        this.state.currentTime = 0;
    }

    /**
     * Derive widget state from loaded media and transcript.
     * @param {Object|null} mediaObj
     * @param {string} transcriptText
     */
    _updateState(mediaObj, transcriptText) {
        this.state.media = mediaObj;
        this.state.currentTime = 0;

        // Handle Transcript
        if (this._detectTranscriptFormat(transcriptText) === "timed") {
            this.state.transcriptLines = this._buildTranscriptLines(transcriptText);
            this.state.plainTextTranscript = null;
        } else if (transcriptText) {
            this.state.transcriptLines = [];
            this.state.plainTextTranscript = transcriptText;
        } else {
            this.state.transcriptLines = [];
            this.state.plainTextTranscript = null;
        }
    }

    _detectTranscriptFormat(transcriptText) {
        if (!transcriptText) {
            return "plaintext";
        }
        const hasTimestamp = transcriptText.includes("-->");
        const hasVttHeader = transcriptText.startsWith("WEBVTT");
        if (hasTimestamp || hasVttHeader) {
            return "timed";
        }
        return "plaintext";
    }

    _buildTranscriptLines(transcriptText) {
        const lines = [];
        const GAP_THRESHOLD_SECONDS = 5;

        const parsed = parseTimedText(transcriptText);
        // Assumes transcript matches media start (offset 0)
        const callOffsetSec = 0;

        for (const line of parsed) {
            const startSecRelToCall = callOffsetSec + line.startTime;
            const endSecRelToCall = callOffsetSec + line.endTime;
            lines.push({
                ...line,
                startSecRelToCall,
                endSecRelToCall,
                isGap: false,
            });
        }

        lines.sort((a, b) => a.startSecRelToCall - b.startSecRelToCall);

        // Insert gaps
        if (lines.length > 1) {
            const linesWithGaps = [lines[0]];
            for (let i = 1; i < lines.length; i++) {
                const prevLine = lines[i - 1];
                const currentLine = lines[i];
                const diff = currentLine.startSecRelToCall - prevLine.endSecRelToCall;
                if (diff > GAP_THRESHOLD_SECONDS) {
                    linesWithGaps.push({
                        isGap: true,
                        duration: diff,
                        startSecRelToCall: prevLine.endSecRelToCall,
                    });
                }
                linesWithGaps.push(currentLine);
            }
            return linesWithGaps;
        }
        return lines;
    }

    /**
     * Propagates a playback time change from the master widget (transcript/timeline) to the
     * underlying media element and updates the transcript highlight.
     * The reverse "Media -> Master" is handled by `onTimeUpdate`.
     *
     * @param {Object} options
     * @param {number} [options.timestamp] - The new time in seconds relative to the call start.
     * @param {boolean} [options.play] - Whether to autoplay after seeking.
     */
    setPlaybackTime = (options = {}) => {
        const { timestamp = this.state.currentTime, play: autoplay = this.state.isPlaying } =
            options;

        this.state.currentTime = timestamp;
        this.updateTranscriptHighlight(timestamp);

        if (!this.state.media) {
            return;
        }

        if (this.mediaPlayerRef.el) {
            const media = this.mediaPlayerRef.el; // TODO rename, confuses this.state.media
            if (!Number.isNaN(media.duration) && timestamp > media.duration) {
                // Handling edge-case: media shorter than the call
                media.currentTime = media.duration;
                if (autoplay) {
                    media.pause();
                    this.state.isPlaying = false;
                }
            } else {
                media.currentTime = timestamp;
                if (autoplay) {
                    media.play().catch(() => {});
                    this.state.isPlaying = true;
                }
            }
        } else {
            // Defer playback until media is loaded
            this.onMediaLoadedCallback = () => this.setPlaybackTime(options);
        }
    };

    /**
    Handles "seeking" on the media element when it plays and propagates it up
    to the master timeline and transcript. The reverse (master → media) is handled in `setPlaybackTime`.
    * @param {Event} ev - The `timeupdate` event from the media element.
    */
    onTimeUpdate = (ev) => {
        if (!this.state.media || ev.target.seeking) {
            return;
        }
        if (this.skipNextTimeUpdate) {
            // Media mount generates first event, skipping removes glitch seeking to 0
            this.skipNextTimeUpdate = false;
            return;
        }

        const mediaCurrentTime = ev.target.currentTime;
        const mediaDuration = ev.target.duration;
        // Handling edge-case: media shorter than the call
        // When seeking past end, browser will try to seek to the end of the media
        if (!Number.isNaN(mediaDuration) && this.state.currentTime > mediaDuration) {
            return;
        }

        this.state.currentTime = mediaCurrentTime; // offset 0
        this.updateTranscriptHighlight(this.state.currentTime);
    };

    /**
     * Runs attached callback once (allows attaching autoplay).
     */
    _onMediaLoaded = () => {
        if (this.onMediaLoadedCallback) {
            this.onMediaLoadedCallback();
            this.onMediaLoadedCallback = null;
        }
    };

    /**
     * Updates the media state with the actual duration from the file metadata.
     * This handles cases where the DB call duration differs from the recording length.
     */
    onLoadedMetadata = (ev) => {
        const duration = ev.target.duration;
        if (this.state.media && !Number.isNaN(duration)) {
            this.state.media.duration = duration;
        }
    };

    /**
     * Highlight the closest transcript line to the given timestamp.
     * @param {number} timestamp - seconds from call start
     */
    updateTranscriptHighlight(timestamp) {
        if (this.state.transcriptLines && this.state.transcriptLines.length > 0) {
            let closestLine = null;
            for (const line of this.state.transcriptLines) {
                if (line.startSecRelToCall <= timestamp) {
                    closestLine = line;
                } else {
                    break;
                }
            }
            if (closestLine) {
                const lineElement = this.transcriptContainerRef.el.querySelector(
                    `[data-timestamp="${closestLine.startSecRelToCall}"]`
                );
                if (lineElement) {
                    if (this.highlightedLineRef && this.highlightedLineRef !== lineElement) {
                        this.highlightedLineRef.classList.remove(
                            "o-CallDebrief-transcript-highlight"
                        );
                    }
                    lineElement.classList.add("o-CallDebrief-transcript-highlight");
                    this.highlightedLineRef = lineElement;
                    lineElement.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }
        }
    }

    /**
     * Finds the index of the currently highlighted transcript line.
     * @returns {number} The index of the highlighted line, or -1 if none is highlighted.
     */
    _getHighlightedLineIndex() {
        if (!this.highlightedLineRef) {
            return -1;
        }
        const highlightedTimestamp = parseFloat(this.highlightedLineRef.dataset.timestamp);
        return this.state.transcriptLines.findIndex(
            (line) => line.startSecRelToCall === highlightedTimestamp
        );
    }
    onTranscriptLineClick = (line) => {
        this.setPlaybackTime({ timestamp: line.startSecRelToCall });
    };

    // -------------------------------------------------------------------------
    // Media Controls
    // -------------------------------------------------------------------------

    onKeyDown = (ev) => {
        const target = ev.target;
        if (
            ev.defaultPrevented ||
            ev.ctrlKey ||
            ev.metaKey ||
            ev.altKey ||
            target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
        ) {
            return;
        }

        switch (ev.key) {
            case "k":
            case " ":
                ev.preventDefault();
                this.togglePlay();
                break;
            case "j":
                this.seekRelative(-5);
                break;
            case "l":
                this.seekRelative(5);
                break;
            case "ArrowLeft":
                ev.preventDefault();
                this.seekRelative(-5);
                break;
            case "ArrowRight":
                ev.preventDefault();
                this.seekRelative(5);
                break;
            case "ArrowUp":
                ev.preventDefault();
                this._jumpToTranscriptLine(-1);
                break;
            case "ArrowDown":
                ev.preventDefault();
                this._jumpToTranscriptLine(1);
                break;
            case "<":
                ev.preventDefault();
                this.adjustPlaybackRate(-1);
                break;
            case ">":
                ev.preventDefault();
                this.adjustPlaybackRate(1);
                break;
            case "m":
                this.toggleMute();
                break;
        }
    };

    /**
     * Jumps to the next or previous transcript line.
     * @param {number} offset - 1 for next line, -1 for previous line.
     */
    _jumpToTranscriptLine(offset) {
        if (!this.hasTranscriptLines) {
            return;
        }

        const currentLineIndex = this._getHighlightedLineIndex();
        let targetIndex = -1;

        if (currentLineIndex === -1) {
            targetIndex = offset > 0 ? 0 : this.state.transcriptLines.length - 1;
        } else {
            targetIndex = currentLineIndex + offset;
            while (
                targetIndex >= 0 &&
                targetIndex < this.state.transcriptLines.length &&
                this.state.transcriptLines[targetIndex].isGap
            ) {
                targetIndex += offset;
            }
        }

        if (targetIndex >= 0 && targetIndex < this.state.transcriptLines.length) {
            const targetLine = this.state.transcriptLines[targetIndex];
            this.skipNextTimeUpdate = true;
            this.setPlaybackTime({ timestamp: targetLine.startSecRelToCall });
        }
        this.showFeedback(`${offset > 0 ? "next" : "previous"} line`);
    }

    /**
     * Adjusts the playback rate based on the given delta.
     * @param {number} delta - 1 to increase speed, -1 to decrease speed.
     */
    adjustPlaybackRate = (delta) => {
        const currentRate = this.state.playbackRate;
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
        this.state.playbackRate = newRate;
        this.showFeedback(`${newRate}x`);
    };

    /**
     * Present textual feedback on the media controls panel that fades away after a timeout
     * @param {*} text
     */
    showFeedback(text) {
        this.state.feedback = { text, id: Date.now() };
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }
        this.feedbackTimeout = setTimeout(() => {
            this.state.feedback.text = "";
        }, 750);
    }

    togglePlay = () => {
        const media = this.mediaPlayerRef.el;
        if (!media) {
            return;
        }
        if (this.state.currentTime > media.duration) {
            this.showFeedback("End of Media");
            return;
        }
        if (this.state.isPlaying) {
            media.pause();
            this.state.isPlaying = false;
            this.showFeedback("Pause");
        } else {
            media.play();
            this.state.isPlaying = true;
            this.showFeedback("Play");
        }
    };

    seekRelative = (delta) => {
        const newTime = Math.max(
            0,
            Math.min(this.callDurationSeconds, this.state.currentTime + delta)
        );
        this.setPlaybackTime({ timestamp: newTime });
        const direction = delta > 0 ? "+" : "-";
        this.showFeedback(`${direction} ${Math.abs(delta)}s`);
    };

    setPlaybackRate = (ev) => {
        this.state.playbackRate = parseFloat(ev.target.value);
    };

    adjustVolume = (delta) => {
        const newVolume = Math.max(0, Math.min(1, this.state.volume + delta));
        this.state.volume = newVolume;
        this.state.isMuted = this.state.volume === 0;
    };

    setVolume = (ev) => {
        this.state.volume = parseFloat(ev.target.value);
        this.state.isMuted = this.state.volume === 0;
    };

    toggleMute = () => {
        this.state.isMuted = !this.state.isMuted;
        if (!this.state.isMuted && this.state.volume === 0) {
            this.state.volume = 0.5;
        }
        this.showFeedback(this.state.isMuted ? "Muted" : "Unmuted");
    };

    seekToMediaStart = () => {
        // Just seek to 0 since offset is always 0 for single media
        this.setPlaybackTime({ timestamp: 0 });
    };
}

export const callDebriefField = {
    component: CallDebrief,
    displayName: "Call Debrief",
    supportedOptions: [
        {
            label: "Start Date Field",
            name: "callStartDateField",
            type: "string",
        },
        {
            label: "End Date Field",
            name: "callEndDateField",
            type: "string",
        },
        {
            label: "Transcript Field",
            name: "transcriptField",
            type: "string",
        },
    ],
    supportedTypes: ["many2one"],
    extractProps: ({ options }) => ({
        callStartDateField: options.callStartDateField,
        callEndDateField: options.callEndDateField,
        transcriptField: options.transcriptField,
    }),
};

registry.category("fields").add("call_debrief", callDebriefField);
