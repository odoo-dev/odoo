import { LONG_PRESS_DURATION } from "@point_of_sale/utils";

export function useLongPress({
    callback,
    timingCallback,
    endCallback,
    delay = LONG_PRESS_DURATION,
}) {
    let timer = null;
    let timingInterval = null;

    function startLongPress(params) {
        if (timingCallback) {
            let total = 0;
            timingInterval = setInterval(() => {
                total += 10;
                const percent = Math.min((total / delay) * 100, 100);
                timingCallback(percent);
            }, 10);
        }

        timer = setTimeout(() => {
            timingInterval && clearInterval(timingInterval);
            endCallback && endCallback();
            callback(params);
        }, delay);
    }

    function cancelLongPress() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        if (timingInterval) {
            clearInterval(timingInterval);
            timingInterval = null;
        }

        endCallback && endCallback();
    }

    return {
        onMouseDown(event, params) {
            if (event.button === 0) {
                startLongPress(params);
            }
        },
        onMouseUp: cancelLongPress,
        onTouchStart(params) {
            startLongPress(params);
        },
        onTouchEnd: cancelLongPress,
        onScroll: cancelLongPress,
    };
}
