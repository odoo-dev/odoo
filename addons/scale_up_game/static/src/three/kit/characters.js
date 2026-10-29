/**
 * Reusable characters. Every rig exposes the same shape so the same animation
 * and walking code drives all of them:
 *   { group, pivot, armL, armR, legL, legR, head, shadow, state, phase, hop }
 * `state`: idle walk carry reach scan inspect wave celebrate talk listen.
 *
 * People are built from the shared cast definition (kit/people.js) so a
 * character looks the same in every level.
 */
import { personLook } from "@scale_up_game/three/kit/people";

const hex = (css) => parseInt(String(css).slice(1), 16);

/** The warehouse bot (training level). */
export function makeBot(scene, { shell = 0xf4f1f6, accent = 0x714b67, trim = 0xff9f1c, glow = 0x017e84 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const pivot = new THREE.Group(); // hovers, leans, turns; scaled => tiny bot
    pivot.scale.setScalar(0.75);
    pivot.position.y = 0.08;
    group.add(pivot);

    const glossy = (color) => scene.mat(color, { roughness: 0.3, metalness: 0.15 });
    const mShell = glossy(shell);
    const mAccent = glossy(accent);
    const mTrim = glossy(trim);
    const mGlow = glossy(glow);
    const visorMat = scene.mat(0x1b2230, { roughness: 0.15, metalness: 0.6 });
    const eyeMat = scene.basic(0x5ff5e8);
    const ringMat = scene.basic(0x30e0d0);
    const highlightMats = [mShell, mAccent, mTrim, mGlow];

    const add = (geo, mat, x, y, z, parent = pivot) => {
        const m = scene.mesh(geo, mat, { x, y, z });
        parent.add(m);
        return m;
    };

    add(new THREE.SphereGeometry(0.36, 24, 16), mAccent, 0, 0.3, 0).scale.set(1, 0.5, 1);
    const ring = add(new THREE.TorusGeometry(0.3, 0.022, 8, 40), ringMat, 0, 0.14, 0);
    ring.rotation.x = Math.PI / 2;
    ring.castShadow = false;
    add(new THREE.CapsuleGeometry(0.26, 0.22, 8, 20), mShell, 0, 0.68, 0);
    add(new THREE.TorusGeometry(0.265, 0.035, 10, 36), mTrim, 0, 0.6, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.07, 16, 12), mGlow, 0, 0.8, 0.25).scale.set(1, 1, 0.4);
    const head = new THREE.Group();
    head.position.y = 1.2;
    pivot.add(head);
    add(new THREE.SphereGeometry(0.3, 28, 20), mShell, 0, 0, 0, head).scale.set(1.15, 0.9, 1);
    add(new THREE.SphereGeometry(0.27, 24, 16), visorMat, 0, 0, 0.19, head).scale.set(1, 0.68, 0.55);
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.01, 0.335);
    for (const x of [-0.1, 0.1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
        eye.position.x = x;
        eye.scale.set(0.7, 1.1, 0.35);
        eyes.add(eye);
    }
    head.add(eyes);
    for (const x of [-0.38, 0.38]) {
        add(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 16), mAccent, x, 0, 0, head).rotation.z = Math.PI / 2;
    }
    const antenna = new THREE.Group();
    antenna.position.set(0, 0.24, 0);
    head.add(antenna);
    add(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), mAccent, 0, 0.1, 0, antenna);
    add(new THREE.SphereGeometry(0.05, 14, 10), mTrim, 0, 0.22, 0, antenna);

    const makeArm = (x) => {
        const arm = new THREE.Group();
        arm.position.set(x, 0.85, 0);
        add(new THREE.CapsuleGeometry(0.065, 0.18, 6, 12), mShell, 0, -0.16, 0, arm);
        add(new THREE.SphereGeometry(0.085, 14, 10), mAccent, 0, -0.34, 0, arm);
        pivot.add(arm);
        return arm;
    };
    const armL = makeArm(-0.4);
    const armR = makeArm(0.4);
    const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.16, 0.7, 20, 1, true),
        scene.basic(0x30e0d0, { transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -0.34 - 0.35;
    beam.visible = false;
    armR.add(beam);
    const shadow = makeShadow(scene, 0.4);
    group.add(shadow);
    return { group, pivot, head, armL, armR, antenna, eyes, shadow, beam, state: "idle", phase: 0, hop: 0, highlightMats, isBot: true };
}

/**
 * A person: business suit (or hi-vis gear), face, hair, hands and shoes.
 * `look` is a cast key ("marc") or an explicit look object (see kit/people.js).
 */
export function makePerson(scene, look = {}, { scale = 1 } = {}) {
    const { THREE } = scene;
    const d = typeof look === "string" ? personLook(look) : { ...personLook("ceo"), ...look };
    const group = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.scale.setScalar(scale);
    group.add(pivot);

    const cloth = (c) => scene.mat(hex(c), { roughness: 0.85 });
    const mJacket = cloth(d.jacket);
    const mShirt = cloth(d.shirt);
    const mTrousers = cloth(d.trousers);
    const mShoes = scene.mat(hex(d.shoes), { roughness: 0.45 });
    const mSkin = scene.mat(hex(d.skin), { roughness: 0.65 });
    const mHair = scene.mat(hex(d.hair), { roughness: 0.9 });
    const mDark = scene.basic(0x20242b);
    const highlightMats = [mJacket, mTrousers];

    const add = (geo, mat, x, y, z, parent) => {
        const m = scene.mesh(geo, mat, { x, y, z });
        parent.add(m);
        return m;
    };

    // --- legs (hip -> shoe, rotate as one group) -------------------------
    const makeLeg = (x) => {
        const leg = new THREE.Group();
        leg.position.set(x, 0.84, 0);
        add(new THREE.CapsuleGeometry(0.075, 0.5, 6, 12), mTrousers, 0, -0.33, 0, leg);
        add(new THREE.BoxGeometry(0.12, 0.08, 0.26), mShoes, 0, -0.76, 0.05, leg);
        pivot.add(leg);
        return leg;
    };
    const legL = makeLeg(-0.095);
    const legR = makeLeg(0.095);

    // --- torso ------------------------------------------------------------
    const torso = new THREE.Group();
    torso.position.y = 0.84;
    pivot.add(torso);
    // shirt front shows between the lapels
    const shirtFront = add(new THREE.CapsuleGeometry(0.15, 0.3, 8, 16), mShirt, 0, 0.26, 0.02, torso);
    shirtFront.scale.set(1.1, 1, 0.8);
    const jacket = add(new THREE.CapsuleGeometry(0.17, 0.32, 8, 20), mJacket, 0, 0.25, 0, torso);
    jacket.scale.set(1.2, 1, 0.78);
    // collar + lapels
    for (const s of [-1, 1]) {
        const lapel = add(new THREE.BoxGeometry(0.1, 0.26, 0.03), mJacket, s * 0.07, 0.4, 0.14, torso);
        lapel.rotation.z = s * 0.22;
    }
    add(new THREE.CylinderGeometry(0.1, 0.11, 0.06, 16), mShirt, 0, 0.56, 0, torso);
    if (d.tie) {
        const mTie = cloth(d.tie);
        add(new THREE.BoxGeometry(0.05, 0.06, 0.03), mTie, 0, 0.53, 0.14, torso);
        const blade = add(new THREE.BoxGeometry(0.06, 0.24, 0.025), mTie, 0, 0.38, 0.145, torso);
        blade.rotation.x = -0.05;
    }
    if (d.hiVis) {
        const mVis = scene.mat(0xf2e14c, { roughness: 0.6, emissive: 0x3a3600 });
        const vest = add(new THREE.CapsuleGeometry(0.175, 0.26, 8, 20), mVis, 0, 0.26, 0, torso);
        vest.scale.set(1.24, 1, 0.84);
        for (const y of [0.32, 0.2]) {
            add(new THREE.TorusGeometry(0.2, 0.012, 8, 28), scene.basic(0xdfe9f2), 0, y, 0, torso).rotation.x = Math.PI / 2;
        }
        highlightMats.push(mVis);
    }
    // shoulders
    for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.085, 14, 12), mJacket, s * 0.2, 0.46, 0, torso);
    }

    // --- arms ---------------------------------------------------------------
    const makeArm = (x) => {
        const arm = new THREE.Group();
        arm.position.set(x, 1.3, 0);
        add(new THREE.CapsuleGeometry(0.062, 0.2, 6, 12), mJacket, 0, -0.17, 0, arm);
        add(new THREE.CapsuleGeometry(0.055, 0.18, 6, 12), mJacket, 0, -0.38, 0, arm);
        add(new THREE.CylinderGeometry(0.056, 0.056, 0.035, 12), mShirt, 0, -0.5, 0, arm);
        add(new THREE.SphereGeometry(0.055, 12, 10), mSkin, 0, -0.56, 0, arm).scale.set(1, 1.1, 0.75);
        pivot.add(arm);
        return arm;
    };
    const armL = makeArm(-0.21);
    const armR = makeArm(0.21);

    // --- head ----------------------------------------------------------------
    const head = new THREE.Group();
    head.position.y = 1.47;
    pivot.add(head);
    add(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 12), mSkin, 0, -0.06, 0, head);
    const skull = add(new THREE.SphereGeometry(0.13, 24, 20), mSkin, 0, 0.1, 0, head);
    skull.scale.set(1, 1.12, 0.95);
    for (const s of [-1, 1]) {
        add(new THREE.SphereGeometry(0.03, 10, 8), mSkin, s * 0.125, 0.09, 0, head).scale.set(0.6, 1, 0.8);
    }
    add(new THREE.ConeGeometry(0.022, 0.05, 10), mSkin, 0, 0.08, 0.125, head).rotation.x = Math.PI / 2;
    const eyes = new THREE.Group();
    eyes.position.set(0, 0.13, 0.108);
    head.add(eyes);
    for (const s of [-1, 1]) {
        const white = scene.mesh(new THREE.SphereGeometry(0.026, 12, 10), scene.basic(0xffffff), { x: s * 0.048, cast: false });
        white.scale.set(1, 0.85, 0.5);
        eyes.add(white);
        const pupil = scene.mesh(new THREE.SphereGeometry(0.012, 10, 8), mDark, { x: s * 0.048, z: 0.016, cast: false });
        eyes.add(pupil);
        const brow = scene.mesh(new THREE.BoxGeometry(0.052, 0.012, 0.012), mHair, { x: s * 0.05, y: 0.05, z: 0.004, cast: false });
        brow.rotation.z = s * 0.1;
        eyes.add(brow);
    }
    const mouth = add(new THREE.BoxGeometry(0.05, 0.012, 0.01), scene.mat(0x8a4a4a), 0, 0.01, 0.125, head);
    if (d.beard) {
        const beard = add(new THREE.SphereGeometry(0.125, 18, 14), mHair, 0, 0.05, 0.015, head);
        beard.scale.set(0.98, 0.72, 0.95);
    }
    // hair styles
    const style = d.hairStyle || "short";
    if (style === "cap") {
        add(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mJacket, 0, 0.1, 0, head);
        add(new THREE.BoxGeometry(0.2, 0.02, 0.1), mJacket, 0, 0.1, 0.11, head);
    } else {
        const cap = add(new THREE.SphereGeometry(0.136, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.58), mHair, 0, 0.1, -0.005, head);
        cap.scale.set(1, 1.08, 0.98);
        if (style === "long") {
            const fall = add(new THREE.CapsuleGeometry(0.11, 0.16, 8, 16), mHair, 0, 0.0, -0.045, head);
            fall.scale.set(1.15, 1, 0.8);
        } else if (style === "bun") {
            add(new THREE.SphereGeometry(0.06, 14, 12), mHair, 0, 0.14, -0.13, head);
        }
    }
    if (d.glasses) {
        const frame = scene.mat(0x2a2f36, { roughness: 0.3, metalness: 0.4 });
        for (const s of [-1, 1]) {
            add(new THREE.TorusGeometry(0.036, 0.006, 8, 20), frame, s * 0.048, 0.13, 0.112, head);
        }
        add(new THREE.BoxGeometry(0.03, 0.006, 0.006), frame, 0, 0.13, 0.112, head);
    }

    const shadow = makeShadow(scene, 0.32);
    group.add(shadow);
    return {
        group, pivot, torso, head, eyes, mouth, armL, armR, legL, legR, shadow,
        state: "idle", phase: 0, hop: 0, seed: Math.random() * 6, highlightMats, look: d,
    };
}

function makeShadow(scene, radius) {
    const { THREE } = scene;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), scene.basic(0x000000, { transparent: true, opacity: 0.2 }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    return shadow;
}

/** Floating name tag (sprite) above a character. */
export function makeNameTag(scene, text, y = 2.12) {
    const { THREE } = scene;
    const { texture } = scene.tex(256, 64, (ctx, w, h) => {
        ctx.fillStyle = "rgba(28,36,48,0.88)";
        if (ctx.roundRect) {
            ctx.beginPath();
            ctx.roundRect(4, 10, w - 8, h - 20, 16);
            ctx.fill();
        } else {
            ctx.fillRect(4, 10, w - 8, h - 20);
        }
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, w / 2, h / 2 + 1);
    });
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(0.95, 0.24, 1);
    sprite.position.y = y;
    return sprite;
}

/** One animation step for any rig: poses arms, legs and head from `state`. */
export function animateActor(rig, dt, t) {
    const s = rig.state;
    const seed = rig.seed || 0;
    let armL = 0, armR = 0, lean = 0, yaw = 0, legs = 0, hover = rig.isBot ? 0.08 + Math.sin(t * 2) * 0.035 : 0;
    let headPitch = 0, headYaw = 0, armSide = 0;
    if (s === "walk" || s === "carry") {
        rig.phase += dt * 9;
        const sw = Math.sin(rig.phase);
        lean = 0.1;
        legs = sw * 0.55;
        if (rig.isBot) {
            hover = 0.1 + Math.sin(rig.phase * 2) * 0.025;
        }
        if (s === "walk") {
            armL = -sw * 0.5;
            armR = sw * 0.5;
        } else {
            armL = armR = -1.25;
        }
    } else if (s === "reach") {
        armL = armR = -1.3;
    } else if (s === "scan") {
        armR = -1.5;
        armL = 0.1;
        yaw = Math.sin(t * 2.2) * 0.5;
        lean = 0.05;
    } else if (s === "inspect") {
        lean = 0.26 + Math.sin(t * 5) * 0.04;
        armL = -0.4;
        armR = -0.7 + Math.sin(t * 6) * 0.2;
    } else if (s === "wave") {
        armR = -2.7 + Math.sin(t * 11) * 0.4;
        armL = 0.05;
    } else if (s === "celebrate") {
        armL = armR = -2.8 + Math.sin(t * 14) * 0.2;
        hover += 0.1;
    } else if (s === "talk") {
        // gestures while speaking: hands move, head bobs a little
        const g = Math.sin(t * 3.4 + seed);
        armR = -0.75 + g * 0.35;
        armL = -0.35 - Math.sin(t * 2.6 + seed) * 0.22;
        armSide = 0.35;
        headPitch = Math.sin(t * 3.1 + seed) * 0.07;
        headYaw = Math.sin(t * 1.7 + seed) * 0.08;
        lean = 0.03;
    } else if (s === "listen") {
        const nod = Math.sin(t * 0.9 + seed);
        headPitch = nod > 0.93 ? 0.16 : 0.03;
        headYaw = Math.sin(t * 0.6 + seed) * 0.05;
        armL = 0.02;
        armR = 0.02;
    } else {
        const sw = Math.sin(t * 1.6 + seed) * 0.05;
        armL = sw;
        armR = -sw;
        headYaw = Math.sin(t * 0.5 + seed) * 0.08;
    }
    const f = Math.min(1, dt * 12);
    rig.armL.rotation.x += (armL - rig.armL.rotation.x) * f;
    rig.armR.rotation.x += (armR - rig.armR.rotation.x) * f;
    rig.armL.rotation.z += (armSide - rig.armL.rotation.z) * f;
    rig.armR.rotation.z += (-armSide - rig.armR.rotation.z) * f;
    rig.pivot.rotation.x += (lean - rig.pivot.rotation.x) * f;
    rig.pivot.rotation.y += (yaw - rig.pivot.rotation.y) * f;
    if (rig.legL) {
        rig.legL.rotation.x += (legs - rig.legL.rotation.x) * f;
        rig.legR.rotation.x += (-legs - rig.legR.rotation.x) * f;
    }
    if (rig.head) {
        rig.head.rotation.x += (headPitch - rig.head.rotation.x) * f;
        rig.head.rotation.y += (headYaw - rig.head.rotation.y) * f;
    }
    if (rig.isBot) {
        const y = hover + rig.hop;
        rig.pivot.position.y = y;
        rig.shadow.scale.setScalar(Math.max(0.5, 1 - (y - 0.08) * 1.5));
        rig.antenna.rotation.z = Math.sin(t * 3) * 0.12 + (s === "walk" || s === "carry" ? Math.sin(rig.phase) * 0.2 : 0);
        rig.eyes.scale.y = t % 3.6 < 0.12 ? 0.1 : 1;
        rig.beam.visible = s === "scan";
    } else {
        // breathing, blinking and a talking mouth
        const breathe = Math.sin(t * 1.4 + seed) * 0.012;
        rig.pivot.position.y = rig.hop + (s === "walk" || s === "carry" ? Math.abs(Math.sin(rig.phase)) * 0.03 : breathe);
        rig.eyes.scale.y = (t + seed) % 4.2 < 0.12 ? 0.1 : 1;
        rig.mouth.scale.y = s === "talk" ? 1 + Math.abs(Math.sin(t * 11 + seed)) * 2.6 : 1;
    }
}
