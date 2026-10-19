import { Component, onMounted, onWillUnmount, proxy, usePlugin } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { LessonRecoveryPlugin } from "../services/lesson_recovery_plugin";
import { LessonRunnerPlugin } from "../services/lesson_runner_plugin";

const BUBBLE_GAP = 14;
const BUBBLE_MAX_WIDTH = 280;
/** Height needed above the target to put the bubble there. */
const BUBBLE_MIN_ROOM = 80;

/**
 * Pulsing amber ring around the element the learner should act on, with a
 * very short instruction next to it. The learning bar explains the why.
 */
export class LessonPointer extends Component {
    static template = "learning.LessonPointer";

    setup() {
        this.runner = usePlugin(LessonRunnerPlugin);
        this.recovery = usePlugin(LessonRecoveryPlugin);
        this.rect = proxy({ top: 0, left: 0, width: 0, height: 0 });
        // follow the target while the page scrolls or its layout changes
        const follow = () => {
            this.updateRect();
            this.frame = requestAnimationFrame(follow);
        };
        onMounted(follow);
        onWillUnmount(() => cancelAnimationFrame(this.frame));
    }

    get visible() {
        const { status, demoRunning } = this.runner.state;
        return status === "running" && !demoRunning && Boolean(this.runner.target());
    }

    /**
     * Beside the target first: dropdowns open below fields and their
     * suggestions must stay readable. Above, then below, if there is no room.
     */
    get placement() {
        const { top, left, width } = this.rect;
        if (left + width + BUBBLE_GAP + BUBBLE_MAX_WIDTH < window.innerWidth) {
            return "right";
        }
        return top > BUBBLE_MIN_ROOM ? "top" : "bottom";
    }

    get ringStyle() {
        const { top, left, width, height } = this.rect;
        return `top: ${top - 6}px; left: ${left - 6}px; width: ${width + 12}px; height: ${height + 12}px;`;
    }

    get bubbleStyle() {
        const { top, left, width, height } = this.rect;
        switch (this.placement) {
            case "right":
                return `top: ${top + height / 2}px; left: ${left + width + BUBBLE_GAP}px; transform: translateY(-50%);`;
            case "top":
                return `bottom: ${window.innerHeight - top + BUBBLE_GAP}px; left: ${Math.max(8, left)}px;`;
            default:
                return `top: ${top + height + BUBBLE_GAP}px; left: ${Math.max(8, left)}px;`;
        }
    }

    updateRect() {
        const target = this.runner.target();
        if (!target) {
            return;
        }
        const { top, left, width, height } = target.getBoundingClientRect();
        if (top !== this.rect.top || left !== this.rect.left || width !== this.rect.width || height !== this.rect.height) {
            Object.assign(this.rect, { top, left, width, height });
        }
    }
}

registry.category("main_components").add("learning.LessonPointer", { Component: LessonPointer });
