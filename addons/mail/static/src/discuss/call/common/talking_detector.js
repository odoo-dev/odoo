export class TalkingDetector {
    _history = [];
    _unsubscribe = null;
    _trackingStartTime = null;
    _lastKnownState = null;
    _wasIntentional = false;
    _timer = null;

    windowMs = 4000; // rolling window to measure duty cycle from
    dutyCycleThreshold = 0.7; // trigger if duty cycle exceeds this

    constructor(rtc) {
        this.rtc = rtc;
    }

    start() {
        this._trackingStartTime = performance.now();

        const initialState = !!this.rtc.selfSession?.isTalking;
        this._history = [{ time: this._trackingStartTime, isTalking: initialState }];
        this._lastKnownState = initialState;
        this._wasIntentional = false;

        this._unsubscribe = this.rtc.onChange(
            () => [this.rtc.selfSession?.isTalking],
            (isTalking) => this._onStateChange(isTalking),
            { initialRun: false }
        );

        this._evaluate();
    }

    _onStateChange(isTalking) {
        if (isTalking === this._lastKnownState) {
            return;
        }
        this._lastKnownState = isTalking;
        this._history.push({ time: performance.now(), isTalking });
        this._evaluate();
    }

    _prune(now) {
        const cutoff = now - this.windowMs;
        let anchorIndex = -1;
        for (let i = 0; i < this._history.length; i++) {
            if (this._history[i].time <= cutoff) {
                anchorIndex = i;
            } else {
                break;
            }
        }
        if (anchorIndex > 0) {
            this._history = this._history.slice(anchorIndex);
        }
    }

    _evaluate() {
        clearTimeout(this._timer);

        const now = performance.now();
        this._prune(now);

        const elapsedSinceStart = now - this._trackingStartTime;
        if (elapsedSinceStart < this.windowMs) {
            // Not enough observed history yet — check again the instant
            // a full window's worth of tracking time exists.
            this._timer = setTimeout(() => this._evaluate(), this.windowMs - elapsedSinceStart);
            return;
        }

        const windowStart = now - this.windowMs;
        const anchorState = this._history[0]?.isTalking ?? false;

        let activeTime = 0;
        let cursor = windowStart;
        let state = anchorState;

        for (let i = 1; i < this._history.length; i++) {
            const entry = this._history[i];
            if (state) {
                activeTime += entry.time - cursor;
            }
            cursor = entry.time;
            state = entry.isTalking;
        }
        if (state) {
            activeTime += now - cursor;
        }

        const dutyCycle = activeTime / this.windowMs;
        console.log("Duty cycle: ", dutyCycle.toFixed(2));

        const isIntentional = dutyCycle >= this.dutyCycleThreshold;
        if (isIntentional !== this._wasIntentional) {
            this._wasIntentional = isIntentional;
            if (isIntentional) {
                this.rtc.showMicrophoneMuteWarning = true;
                console.warn("Intentional talking detected");
            }
        }

        // ------------------------------------------------------------
        // Schedule the NEXT evaluation for the exact moment something
        // could actually change the outcome, instead of polling on a
        // fixed interval. Between real state changes, activeTime moves
        // at a constant rate: +1ms per 1ms if the current state is
        // "true" and the anchor (state at the window's leading edge)
        // is "false", -1ms/ms in the reverse case, and 0 if they match
        // (nothing to detect — duty cycle is flat).
        // ------------------------------------------------------------
        const currentValue = this._lastKnownState ? 1 : 0;
        const anchorValue = anchorState ? 1 : 0;
        const rate = currentValue - anchorValue; // -1, 0, or 1 (ms of active time per ms)

        const thresholdActiveMs = this.dutyCycleThreshold * this.windowMs;
        let crossingTime = Infinity;
        if (rate > 0 && activeTime < thresholdActiveMs) {
            // Rising toward the threshold — solve for when it's reached
            crossingTime = now + (thresholdActiveMs - activeTime);
        } else if (rate < 0 && activeTime > thresholdActiveMs) {
            // Falling back through the threshold
            crossingTime = now + (activeTime - thresholdActiveMs);
        }
        // if rate === 0, duty cycle is flat — no natural crossing pending

        // The other thing that can change the math: the current anchor
        // entry ages out of the window and history[1] becomes the new
        // anchor, which can change the rate itself.
        const nextAnchorExpiry =
            this._history.length > 1 ? this._history[1].time + this.windowMs : Infinity;

        const nextCheckTime = Math.min(crossingTime, nextAnchorExpiry);

        if (nextCheckTime !== Infinity) {
            this._timer = setTimeout(() => this._evaluate(), Math.max(0, nextCheckTime - now));
        }
        // else: truly nothing left that could change the result on its
        // own — safe to stay fully idle until the next real onChange
        // fires. E.g. a user talking continuously since start(), never
        // toggling, needs zero timers once duty cycle has settled.
    }

    stop() {
        this.rtc.showMicrophoneMuteWarning = false;
        this._history = [];
        clearTimeout(this._timer);
        this._unsubscribe?.();
        this._unsubscribe = null;
    }
}
