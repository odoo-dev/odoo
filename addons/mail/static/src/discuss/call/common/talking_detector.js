/**
 * Detects that the user has been talking for a large part of a recent time
 * window while their microphone is muted. Talking into a live microphone is
 * normal and is never counted, so the measure only ever grows while muted, and
 * unmuting clears it: the user then demonstrably knows their mic works.
 *
 * The measure is a duty cycle: the share of the last `windowMs` spent talking
 * while muted. Once it reaches `dutyCycleThreshold` the detector latches, and
 * `rtc.showMicrophoneMuteWarning` stays true until the user unmutes or the call
 * ends.
 */
export class TalkingDetector {
    /** @type {number} length of the rolling window, in ms */
    windowMs = 4000;
    /** @type {number} share of the window spent talking while muted that warns the user */
    dutyCycleThreshold = 0.7;

    /** @type {{start: number, duration: number}[]} bursts that already ended, oldest first */
    _bursts = [];
    /** @type {number|null} start of the burst in progress, null when not talking */
    _burstStart = null;
    /** @type {number|null} when the current measure started, null when not measuring */
    _startedAt = null;
    /** @type {number|undefined} pending duty cycle re-check */
    _timer;

    /**
     * @param {import("@mail/discuss/call/common/rtc_service").Rtc} rtc
     */
    constructor(rtc) {
        this.rtc = rtc;
        // Subscribed for the whole life of the detector: `onChange` offers no way
        // to cancel, so `_onStateChange` ignores everything while stopped.
        rtc.onChange(
            () => [rtc.selfSession?.isTalking, rtc.selfSession?.isMute],
            (isTalking, isMute) => this._onStateChange(isTalking, isMute)
        );
    }

    start() {
        // Also guards against a stale detector still holding an older session.
        this.stop();
        this._startedAt = Date.now();
    }

    stop() {
        clearTimeout(this._timer);
        this._timer = undefined;
        this._bursts = [];
        this._burstStart = null;
        this._startedAt = null;
        this.rtc.showMicrophoneMuteWarning = false;
    }

    /**
     * @param {boolean} isTalking
     * @param {boolean} isMute
     */
    _onStateChange(isTalking, isMute) {
        if (this._startedAt === null) {
            return;
        }
        if (!isMute) {
            // An unmuted microphone is proof the user is heard: whatever they
            // were doing while muted no longer matters, start over.
            this.start();
            return;
        }
        const now = Date.now();
        if (isTalking && this._burstStart === null) {
            this._burstStart = now;
        } else if (!isTalking && this._burstStart !== null) {
            this._bursts.push({ start: this._burstStart, duration: now - this._burstStart });
            this._burstStart = null;
        }
        this._evaluate();
    }

    _evaluate() {
        const now = Date.now();
        const windowStart = now - this.windowMs;
        this._bursts = this._bursts.filter((burst) => burst.start + burst.duration > windowStart);

        // Bursts are closed in the past, so their end never needs clamping to
        // `now`; only their start may predate the window.
        let talkingTime = 0;
        for (const burst of this._bursts) {
            talkingTime += burst.start + burst.duration - Math.max(burst.start, windowStart);
        }
        if (this._burstStart !== null) {
            talkingTime += now - Math.max(this._burstStart, windowStart);
        }

        if (talkingTime >= this.dutyCycleThreshold * this.windowMs) {
            this.rtc.showMicrophoneMuteWarning = true;
            return;
        }

        clearTimeout(this._timer);
        // While a burst is open the duty cycle grows by 1ms per ms, so re-check
        // exactly when it can reach the threshold. Otherwise it is flat, and the
        // next state change is the only thing that can move it. Once the warning
        // is shown there is nothing left to watch for.
        if (this._burstStart === null || this.rtc.showMicrophoneMuteWarning) {
            return;
        }
        const msToThreshold = this.dutyCycleThreshold * this.windowMs - talkingTime;
        this._timer = setTimeout(() => this._evaluate(), Math.max(0, msToThreshold));
    }
}
