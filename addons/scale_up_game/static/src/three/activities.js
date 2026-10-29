import { Aborted, faceTowards, walkTo } from "@scale_up_game/three/animations";

const sleep = (scene, seconds) => scene.animator.tween(seconds, () => {});

async function ck(ctx, promise) {
    await promise;
    if (ctx.aborted) {
        throw new Aborted();
    }
}

/** What the bot does while it has no job: it patrols, scans, checks things. */
const ACTIVITIES = [
    { label: "Scanning stock…", spot: "rack", state: "scan", time: 2.8 },
    { label: "Checking orders…", spot: "desk", state: "inspect", time: 2.4 },
    { label: "Inspecting pallets…", spot: "pallets", state: "inspect", time: 2.6 },
    { label: "Counting boxes…", spot: "source", state: "scan", time: 2.4 },
    { label: "Checking the shelf…", spot: "shelf", state: "scan", time: 2.2 },
    { label: "Beep boop!", spot: "centre", state: "wave", time: 1.8 },
    { label: "Doing a happy spin", spot: "centre", spin: true, time: 1.0 },
];

export class ActivityDirector {
    constructor(scene) {
        this.scene = scene;
        this.ctx = { aborted: true };
    }

    get active() {
        return !this.ctx.aborted;
    }

    start() {
        this.stop();
        this.ctx = { aborted: false };
        this._last = null;
        this._loop(this.ctx);
    }

    stop() {
        this.ctx.aborted = true;
        this.scene.animator.cancelAll();
        this.scene.onActivity?.(null);
    }

    _pick() {
        let act;
        do {
            act = ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)];
        } while (act === this._last && ACTIVITIES.length > 1);
        this._last = act;
        return act;
    }

    async _loop(ctx) {
        const scene = this.scene;
        try {
            await ck(ctx, sleep(scene, 0.6));
            while (!ctx.aborted && !scene.disposed) {
                await this._run(this._pick(), ctx);
                scene.onActivity?.(null);
                scene.setWorkerState("idle");
                await ck(ctx, sleep(scene, 0.4 + Math.random() * 0.9));
            }
        } catch (e) {
            if (!(e instanceof Aborted)) {
                console.error(e);
            }
        }
    }

    async _run(act, ctx) {
        const scene = this.scene;
        const spot = scene.layout.spots[act.spot];
        const group = scene.worker.group;
        scene.onActivity?.(null);
        await walkTo(scene, spot.stand, "walk", ctx);
        if (spot.look) {
            await ck(ctx, faceTowards(scene.animator, group, spot.look));
        }
        scene.onActivity?.(act.label);
        if (act.spin) {
            const startY = group.rotation.y;
            await ck(ctx, scene.animator.tween(act.time, (k) => {
                group.rotation.y = startY + k * Math.PI * 2;
                scene.worker.hop = Math.sin(k * Math.PI) * 0.25;
            }));
            scene.worker.hop = 0;
        } else {
            scene.setWorkerState(act.state);
            await ck(ctx, sleep(scene, act.time));
        }
    }
}
