/**
 * Tiny tween runner + the scripted Level 1 animation.
 * Pure visuals: no business logic lives here.
 */

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const linear = (t) => t;

export class Animator {
    constructor() {
        this._tweens = [];
    }

    /** Run onUpdate(k) for k in 0..1 over `duration` seconds. Resolves when done. */
    tween(duration, onUpdate, ease = easeInOut) {
        return new Promise((resolve) => {
            this._tweens.push({ duration: Math.max(duration, 0.0001), elapsed: 0, onUpdate, ease, resolve });
        });
    }

    update(dt) {
        for (const tw of [...this._tweens]) {
            tw.elapsed += dt;
            const k = Math.min(tw.elapsed / tw.duration, 1);
            tw.onUpdate(tw.ease(k));
            if (k >= 1) {
                this._tweens.splice(this._tweens.indexOf(tw), 1);
                tw.resolve();
            }
        }
    }

    /** Stop every tween; pending promises resolve so coroutines can unwind. */
    cancelAll() {
        for (const tw of this._tweens.splice(0)) {
            tw.resolve();
        }
    }
}

const WALK_SPEED = 2.2; // units / second

/** Thrown inside an interrupted coroutine (see ActivityDirector). */
export class Aborted extends Error {}

export function rotateTo(animator, obj, targetY) {
    const from = obj.rotation.y;
    let delta = targetY - from;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // shortest way round
    return animator.tween(Math.abs(delta) / 4 + 0.05, (k) => {
        obj.rotation.y = from + delta * k;
    });
}

export function faceTowards(animator, obj, point) {
    const dx = point.x - obj.position.x;
    const dz = point.z - obj.position.z;
    return rotateTo(animator, obj, Math.atan2(dx, dz));
}

export async function walkTo(scene, target, state, ctx) {
    const { THREE, animator, worker } = scene;
    const check = () => {
        if (ctx && ctx.aborted) {
            throw new Aborted();
        }
    };
    const group = worker.group;
    const to = new THREE.Vector3(target.x, 0, target.z);
    const from = group.position.clone();
    const dist = from.distanceTo(to);
    if (dist > 0.05) {
        await faceTowards(animator, group, to);
        check();
    }
    scene.setWorkerState(state);
    await animator.tween(dist / WALK_SPEED, (k) => group.position.lerpVectors(from, to, k), linear);
    check();
}

/**
 * walk to box -> pick up -> carry to shelf -> place -> return to idle spot.
 * Resolves when the whole sequence is finished.
 */
export async function runRestockSequence(scene) {
    const { THREE, animator, worker, box, layout } = scene;
    const group = worker.group;
    const boxGroup = box.group;

    // 1. Walk to the box
    await walkTo(scene, layout.workerAtBox, "walk");
    await faceTowards(animator, group, boxGroup.position);

    // 2. Pick up: arms forward, box moves from the floor to the carrying position
    scene.setWorkerState("reach");
    await animator.tween(0.35, () => {});
    group.attach(boxGroup); // keeps the world transform: no visual jump, no duplicate
    const startPos = boxGroup.position.clone();
    const startQuat = boxGroup.quaternion.clone();
    const identity = new THREE.Quaternion();
    await animator.tween(0.5, (k) => {
        boxGroup.position.lerpVectors(startPos, layout.carryOffset, k);
        boxGroup.quaternion.copy(startQuat).slerp(identity, k);
    });

    // 3. Carry it to the shelf
    await walkTo(scene, layout.workerAtShelf, "carry");
    await faceTowards(animator, group, layout.shelfSlot);

    // 4. Place it in the empty section (reparent to scene, keep world transform)
    scene.setWorkerState("reach");
    scene.scene.attach(boxGroup);
    const placeStart = boxGroup.position.clone();
    const placeQuatStart = boxGroup.quaternion.clone();
    await animator.tween(0.7, (k) => {
        boxGroup.position.lerpVectors(placeStart, layout.shelfSlot, k);
        boxGroup.position.y += Math.sin(k * Math.PI) * 0.15;
        boxGroup.quaternion.copy(placeQuatStart).slerp(identity, k);
    });

    // 5. Back to the idle spot
    await animator.tween(0.25, () => {});
    await walkTo(scene, layout.workerIdle, "walk");
    await rotateTo(animator, group, 0);
    scene.setWorkerState("idle");
}
