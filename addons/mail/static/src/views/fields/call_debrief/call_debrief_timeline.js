/** @odoo-module **/

import { Component, onWillUnmount, useRef, useState } from "@odoo/owl";
import { formatDuration } from "./call_debrief_utils";

export class CallDebriefTimeline extends Component {
    static template = "mail.CallDebriefTimeline";
    static props = {
        totalDuration: { type: Number },
        transcriptLines: { type: Array, optional: true },
        media: { type: Object, optional: true },
        onSeek: { type: Function },
        currentTime: { type: Number, optional: true },
    };

    setup() {
        this.formatDuration = formatDuration;
        this.timelineRef = useRef("timeline");
        this.isDragging = false;
        this.state = useState({
            timelineHeight: 20, // Fixed height for a single track
        });

        onWillUnmount(() => {
            window.removeEventListener("mousemove", this.onDragMove);
            window.removeEventListener("mouseup", this.onDragEnd);
        });
    }

    _stylePositionTranscriptMarker(line) {
        if (!this.props.totalDuration) {
            return "left: 0%;";
        }
        return `left: ${(line.startSecRelToCall / this.props.totalDuration) * 100}%;`;
    }

    _stylePositionPlayhead() {
        if (!this.props.totalDuration) {
            return "left: 0%;";
        }
        return `left: ${(this.props.currentTime / this.props.totalDuration) * 100}%;`;
    }

    _stylePositionMediaSegment(media) {
        if (!this.props.totalDuration || !media || !media.duration) {
            return `left: 0%; width: 0%;`;
        }
        const width = Math.min(100, (media.duration / this.props.totalDuration) * 100);
        return `left: 0%; width: ${width}%;`;
    }

    onDragStart(event) {
        this.isDragging = true;
        window.addEventListener("mousemove", this.onDragMove);
        window.addEventListener("mouseup", this.onDragEnd);
        this._updateSeek(event);
    }

    onDragMove = (event) => {
        if (this.isDragging) {
            this._updateSeek(event);
        }
    };

    onDragEnd = () => {
        this.isDragging = false;
        window.removeEventListener("mousemove", this.onDragMove);
        window.removeEventListener("mouseup", this.onDragEnd);
    };

    _getTimestampFromClientX(clientX) {
        const el = this.timelineRef.el;
        if (!el || !this.props.totalDuration) {
            return 0;
        }
        const rect = el.getBoundingClientRect();
        const progress = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return progress * this.props.totalDuration;
    }

    _updateSeek(event) {
        const newTimestamp = this._getTimestampFromClientX(event.clientX);
        this.props.onSeek({ timestamp: newTimestamp });
    }

    get formattedTotalDuration() {
        return this.formatDuration(this.props.totalDuration);
    }
}
