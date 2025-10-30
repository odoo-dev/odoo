/** @odoo-module **/

import { Component, useState, onWillStart, useRef, onWillUpdateProps, onMounted, onWillUnmount } from "@odoo/owl";
import { formatDuration } from "./call_debrief_utils";
import { CallDebriefTimeline } from "./call_debrief_timeline";
import { CallDebriefMediaControls } from "./call_debrief_media_controls";
import { parseSRT } from "./parse_srt";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { parseDateTime } from "@web/core/l10n/dates";

export class CallDebrief extends Component {
    static template = "call_debrief.CallDebrief";
    static props = {
        ...standardFieldProps,
        callStartDateField: { type: String },
        callEndDateField: { type: String },
    };

    static components = { CallDebriefTimeline, CallDebriefMediaControls };

    setup() {
        this.callStartDate = null;
        this.callEndDate = null;
        this.callDurationSeconds = 0;
        this.hasPlayableArtifacts = false;
        this.playbackRates = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2];

        this.mediaPlayerRef = useRef("mediaPlayer");
        this.transcriptContainerRef = useRef("transcriptContainer");
        this.highlightedLineRef = null;

        this.orm = useService("orm");
        this.state = useState({
            currentTime: 0,
            artifacts: [],
            selectedPlayableArtifact: null,
            playableArtifacts: [],
            transcriptLines: [],
            plainTextTranscripts: [],
            hasVideo: false,
            error: "",
            isPlaying: false,
            playbackRate: 1,
            volume: 1,
            isMuted: false,
            feedback: { text: "", id: Date.now() },
        });

        this.onMediaLoadedCallback = null;
        this.formatDuration = formatDuration;

        onWillStart(() => this._loadArtifacts(this.props));

        onWillUpdateProps(async (nextProps) => {
            if (this.props.record.resId !== nextProps.record.resId) {
                await this._loadArtifacts(nextProps);
            }
        });

        onMounted(() => {
            window.addEventListener("keydown", this.onKeyDown);
        });

        onWillUnmount(() => {
            window.removeEventListener("keydown", this.onKeyDown);
        });
    }

    showFeedback(text) {
        this.state.feedback = { text, id: Date.now() };
        if (this.feedbackTimeout) {
            clearTimeout(this.feedbackTimeout);
        }
        this.feedbackTimeout = setTimeout(() => {
            this.state.feedback.text = "";
        }, 750);
    }

    /**
     * Adjusts the playback rate based on the given delta.
     * @param {number} delta - 1 to increase speed, -1 to decrease speed.
     */
    adjustPlaybackRate = (delta) => {
        const currentRate = this.state.playbackRate;
        // Find the index of the rate in the array that is closest to the current rate.
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
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.playbackRate = newRate;
        }
        this.showFeedback(`${newRate}x`);
    };

    get hasTranscriptLines() {
        return this.state.transcriptLines.length > 0;
    }

    get hasPlainTextTranscript() {
        return this.state.plainTextTranscripts.length > 0;
    }

    /**
     * Main function to load artifacts from the database and normalize them.
     * @param {Object} props - component props
     */
    async _loadArtifacts(props) {
        this.state.error = "";
        if (!this._initCallTiming(props)) {
            return;
        }

        const artifactIds = props.record.data[props.name]?.currentIds || [];
        if (!artifactIds.length) {
            this._resetArtifactsState();
            return;
        }
        const modelName = props.record.fields[props.name].relation;
        const rawArtifacts = await this._fetchArtifacts(modelName, artifactIds);
        const normalizedArtifacts = rawArtifacts.map((a) => this._normalizeArtifact(a));
        const validArtifacts = this._filterArtifactsByAbsoluteTime(normalizedArtifacts);
        this._updateStateFromArtifacts(validArtifacts, modelName);
    }

    // -------------------------------------------------------------------------
    // Data loading helper methods
    // -------------------------------------------------------------------------

    /**
     * Resolves call timing (start/end and duration) from parent record.
     * @param {Object} props - component props
     * @returns {boolean} true if timing is valid, false otherwise
     */
    _initCallTiming(props) {
        const start = props.record.data[props.callStartDateField];
        const end = props.record.data[props.callEndDateField];

        if (!start || !end) {
            this.state.error = "CallDebrief widget needs start and end datetime from the parent record.";
            this._resetArtifactsState();
            return false;
        }
        this.callStartDate = start;
        this.callEndDate = end;
        this.callDurationSeconds = this.callEndDate.diff(this.callStartDate, "seconds").seconds;

        return true;
    }

    /**
     * Fetch artifacts from the ORM.
     *
     * @param {string} modelName - artifact model name
     * @param {number[]} ids - artifact record ids
     * @returns {Promise<Object[]>} raw artifacts from the server
     */
    _fetchArtifacts(modelName, ids) {
        const domain = [
            ["id", "in", ids],
            ["role", "=", "debrief"],
            ["hidden_in_debrief", "=", false],
        ];
        return this.orm.searchRead(modelName, domain, [
            "artifact_type",
            "transcript",
            "audio",
            "video",
            "start",
            "end",
        ]);
    }

    /**
     * Normalize a raw artifact record coming from ORM
     * @param {Object} raw - artifact read() result
     * @returns {Object} normalized artifact
     */
    _normalizeArtifact(raw) {
        const start = raw.start ? parseDateTime(raw.start, { tz: "UTC" }) : null;
        const end = raw.end ? parseDateTime(raw.end, { tz: "UTC" }) : null;
        const duration = start && end ? end.diff(start, "seconds").seconds : 0;
        const callOffsetSec = start ? start.diff(this.callStartDate, "seconds").seconds : 0;
        return {
            ...raw,
            start,
            end,
            duration,
            callOffsetSec, // seconds from call start
        };
    }

    /**
     * Remove artifacts whose absolute timestamps fall outside the call window.
     * Logs removed artifacts but does not throw.
     *
     * @param {Object[]} artifacts - normalized artifacts with start/end as DateTime
     * @returns {Object[]} filtered artifacts
     */
    _filterArtifactsByAbsoluteTime(artifacts) {
        const validArtifacts = [];

        for (const a of artifacts) {
            if (a.artifact_type !== "transcript" && (!a.start || !a.end)) {
                console.warn("[CallDebrief] Non-transcript artifact missing timestamps → dropping:", a);
                continue;
            }
            if (a.start && a.end && (a.start < this.callStartDate || a.end > this.callEndDate || a.start >= a.end)) {
                console.warn("[CallDebrief] Artifact outside call bounds → dropping:", {
                    id: a.id,
                    artifactType: a.artifact_type,
                    artifactStart: a.start.toISO(),
                    artifactEnd: a.end.toISO(),
                    callStart: this.callStartDate.toISO(),
                    callEnd: this.callEndDate.toISO(),
                });
                continue;
            }
            validArtifacts.push(a);
        }
        return validArtifacts;
    }

    /**
     * Reset all artifact-related state to a neutral "empty" configuration.
     */
    _resetArtifactsState() {
        this.state.selectedPlayableArtifact = null;
        this.state.artifacts = [];
        this.state.playableArtifacts = [];
        this.state.transcriptLines = [];
        this.state.plainTextTranscripts = [];
        this.state.hasVideo = false;
        this.state.currentTime = 0;
    }

    /**
     * Derive widget state (artifacts, transcript, playable media) from valid artifacts.
     * @param {Object[]} validArtifacts - normalized and filtered artifacts
     * @param {string} modelName - artifact model name (for media URLs)
     */
    _updateStateFromArtifacts(validArtifacts, modelName) {
        this.state.artifacts = validArtifacts;
        this.state.currentTime = 0;
        this.state.hasVideo = validArtifacts.some((a) => a.artifact_type === "video");

        // Transcripts
        this.state.transcriptLines = this._buildTranscriptLines(validArtifacts);
        this.state.plainTextTranscripts = this._buildPlainTextTranscripts(validArtifacts);

        // Playable audio/video artifacts
        this.state.playableArtifacts = validArtifacts
            .filter((a) => a.artifact_type === "audio" || a.artifact_type === "video")
            .sort((a, b) => a.start.diff(b.start).milliseconds);
        this.hasPlayableArtifacts = !!this.state.playableArtifacts.length;

        this.state.selectedPlayableArtifact = this.state.playableArtifacts[0] || undefined;
        if (this.state.selectedPlayableArtifact) {
            const { id, artifact_type } = this.state.selectedPlayableArtifact;
            this.state.selectedPlayableArtifact.mediaUrl = `/web/content/${modelName}/${id}/${artifact_type}`;
        }
    }

    /**
     * Simple transcript format detection.
     * @param {string} transcriptText
     * @returns {'srt'|'plaintext'}
     */
    _detectTranscriptFormat(transcriptText) {
        if (transcriptText && transcriptText.includes("-->")) {
            return "srt";
        }
        return "plaintext";
    }

    /**
     * Build transcript lines (relative to call start) from all SRT transcript artifacts.
     * Inserts gaps between lines that are more than GAP_THRESHOLD_SECONDS seconds apart.
     * @param {Object[]} artifacts - normalized artifacts (with callOffsetSec)
     * @returns {Object[]} sorted transcript lines
     */
    _buildTranscriptLines(artifacts) {
        const lines = [];
        const GAP_THRESHOLD_SECONDS = 5;

        const transcriptArtifacts = artifacts.filter(
            (a) =>
                a.artifact_type === "transcript" &&
                this._detectTranscriptFormat(a.transcript) === "srt"
        );

        for (const artifact of transcriptArtifacts) {
            const parsed = parseSRT(artifact.transcript);
            for (const line of parsed) {
                const startSecRelToCall = artifact.callOffsetSec + line.startTime;
                const endSecRelToCall = artifact.callOffsetSec + line.endTime;
                lines.push({
                    ...line,
                    startSecRelToCall,
                    endSecRelToCall,
                    isGap: false,
                });
            }
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
     * Extracts content from all non-SRT transcript artifacts.
     * @param {Object[]} artifacts
     * @returns {string[]}
     */
    _buildPlainTextTranscripts(artifacts) {
        return artifacts
            .filter(
                (a) =>
                    a.artifact_type === "transcript" &&
                    this._detectTranscriptFormat(a.transcript) === "plaintext"
            )
            .map((a) => a.transcript);
    }
    // -------------------------------------------------------------------------
    // Media, timeline and transcript interactions
    // -------------------------------------------------------------------------

    /**
     * Updates the master call timeline and propagates the seek down to the media element.
     * Called by the master timeline (drag/seek), transcript line clicks, media controls.
     * The reverse (media → master) is handled in `onTimeUpdate`.
     *
     * @param {Object} [options]
     * @param {number} [options.timestamp=this.state.currentTime] - Target time in seconds from call start.
     * @param {boolean} [options.play=this.state.isPlaying] - Whether playback should resume after seeking.
     * @param {number|null} [options.artifactId=null] - Explicit artifact id to target.
     */
    setPlaybackTime = (options = {}) => {
        const {
            timestamp = this.state.currentTime,
            play: autoplay = this.state.isPlaying,
            artifactId = null,
        } = options;

        // Update master time and transcript
        this.state.currentTime = timestamp;
        this.updateTranscriptHighlight(timestamp);

        // Resolve which artifact should handle this time
        const artifactUnderCursor = artifactId
            ? this.state.playableArtifacts.find((a) => a.id === artifactId)
            : this._findArtifactForTime(timestamp);

        if (!artifactUnderCursor) {
            if (this.mediaPlayerRef.el) {
                this.mediaPlayerRef.el.pause();
            }
            return;
        }

        const current = this.state.selectedPlayableArtifact;
        const isSameArtifact = current && current.id === artifactUnderCursor.id;

        // SAME ARTIFACT → seek inside current media
        if (isSameArtifact) {
            if (this.mediaPlayerRef.el) {
                const mediaTimestamp = timestamp - artifactUnderCursor.callOffsetSec;
                this.mediaPlayerRef.el.currentTime = mediaTimestamp;
                if (autoplay) {
                    this.mediaPlayerRef.el.play().catch((err) => {
                        if (odoo.debug) {
                            console.warn(
                                "CallDebrief couldn't play media when seeking inside current artifact",
                                {
                                    error: err,
                                    targetTimestamp: timestamp,
                                    artifact: artifactUnderCursor,
                                    stateSnapshot: JSON.stringify(this.state),
                                }
                            );
                        }
                    });
                }
            }
            return;
        }

        // DIFFERENT ARTIFACT → switch source
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.removeEventListener("timeupdate", this.onTimeUpdate);
            this.pendingMediaSeek = true; // see `onTimeUpdate`
        }
        const modelName = this.props.record.fields[this.props.name].relation;
        artifactUnderCursor.mediaUrl = `/web/content/${modelName}/${artifactUnderCursor.id}/${artifactUnderCursor.artifact_type}`;

        if (autoplay) {
            // Wait for media to be loaded before seeking/playing it
            this.onMediaLoadedCallback = () => {
                if (!this.mediaPlayerRef.el) {
                    return;
                }
                const mediaTimestamp = timestamp - artifactUnderCursor.callOffsetSec;
                this.mediaPlayerRef.el.currentTime = mediaTimestamp;
                this.mediaPlayerRef.el.play().catch(() => {});
            };
        }

        this.state.selectedPlayableArtifact = artifactUnderCursor;
    };

    /**
     * Find the playable artifact (audio/video) that covers a given call-relative timestamp.
     *
     * @param {number} timestamp - seconds from call start
     * @returns {Object|undefined} matching artifact or undefined if none
     */
    _findArtifactForTime(timestamp) {
        const current = this.state.selectedPlayableArtifact;
        if (current) {
            if (
                timestamp >= current.callOffsetSec &&
                timestamp < current.callOffsetSec + current.duration
            ) {
                return current;
            }
        }

        return this.state.playableArtifacts.find(
            (artifact) =>
                timestamp >= artifact.callOffsetSec &&
                timestamp < artifact.callOffsetSec + artifact.duration
        );
    }

    /**
    Handles "seeking" on the media element and propagates it up
    to the master timeline and transcript. The reverse (master → media) is handled in `setPlaybackTime`.
    * @param {Event} ev - The `timeupdate` event from the media element.
    */
    onTimeUpdate = (ev) => {
        if (!this.state.selectedPlayableArtifact || ev.target.seeking) {
            return;
        }
        if (this.pendingMediaSeek != false) {
            // Media mount generates first event, skipping removes glitch seeking to 0
            this.pendingMediaSeek = false;
            return;
        }

        const artifactOffset = this.state.selectedPlayableArtifact.callOffsetSec;
        const mediaCurrentTime = ev.target.currentTime;
        this.state.currentTime = mediaCurrentTime + artifactOffset;
        this.updateTranscriptHighlight(this.state.currentTime);
    };

    /**
     * Runs attached callback once (allows attaching autoplay).
     */
    _onPlayableArtifactLoaded = () => {
        const media = this.mediaPlayerRef.el;
        if (media) {
            media.playbackRate = this.state.playbackRate;
            media.volume = this.state.volume;
            media.muted = this.state.isMuted;
        }
        if (this.onMediaLoadedCallback) {
            this.onMediaLoadedCallback();
            this.onMediaLoadedCallback = null;
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
                        this.highlightedLineRef.classList.remove("o-CallDebrief-transcript-highlight");
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
            this.pendingMediaSeek = true;
            this.setPlaybackTime({ timestamp: targetLine.startSecRelToCall });
        }
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
            case "<": // <
                ev.preventDefault();
                this.adjustPlaybackRate(-1);
                break;
            case ">": // >
                ev.preventDefault();
                this.adjustPlaybackRate(1);
                break;
            case "m":
                this.toggleMute();
                break;
        }
    };

    togglePlay = () => {
        const media = this.mediaPlayerRef.el;
        if (!media) {
            return;
        }
        if (this.state.isPlaying) {
            media.pause();
            this.showFeedback("Pause");
        } else {
            media.play();
            this.showFeedback("Play");
        }
    };

    seekRelative = (delta) => {
        const newTime = Math.max(0, Math.min(this.callDurationSeconds, this.state.currentTime + delta));
        this.setPlaybackTime({ timestamp: newTime });
        const direction = delta > 0 ? "+" : "-";
        this.showFeedback(`${direction} ${Math.abs(delta)}s`);
    };

    setPlaybackRate = (ev) => {
        this.state.playbackRate = parseFloat(ev.target.value);
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.playbackRate = this.state.playbackRate;
        }
    };

    adjustVolume = (delta) => {
        const newVolume = Math.max(0, Math.min(1, this.state.volume + delta));
        this.state.volume = newVolume;
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.volume = this.state.volume;
            this.state.isMuted = this.state.volume === 0;
            this.mediaPlayerRef.el.muted = this.state.isMuted;
        }
    };

    setVolume = (ev) => {
        this.state.volume = parseFloat(ev.target.value);
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.volume = this.state.volume;
            this.state.isMuted = this.state.volume === 0;
            this.mediaPlayerRef.el.muted = this.state.isMuted;
        }
    };

    toggleMute = () => {
        this.state.isMuted = !this.state.isMuted;
        if (this.mediaPlayerRef.el) {
            this.mediaPlayerRef.el.muted = this.state.isMuted;
            if (!this.state.isMuted && this.state.volume === 0) {
                this.state.volume = 0.5;
                this.mediaPlayerRef.el.volume = 0.5;
            }
        }
        this.showFeedback(this.state.isMuted ? "Muted" : "Unmuted");
    };

    seekToArtifactStart = () => {
        const artifact = this.state.playableArtifacts.find(
            (a) => a.id === this.state.selectedPlayableArtifact.id
        );
        if (artifact) {
            this.setPlaybackTime({ timestamp: artifact.callOffsetSec });
        }
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
    ],
    supportedTypes: ["one2many"],
    extractProps: ({ options }) => ({
        callStartDateField: options.callStartDateField,
        callEndDateField: options.callEndDateField,
    }),
};

registry.category("fields").add("call_debrief", callDebriefField);

