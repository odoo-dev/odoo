/**
 * Reusable props. Each factory takes the scene (for materials/helpers) and
 * returns a THREE.Group (plus handles when the prop has a dynamic part).
 * Positions/rotations are set by the layout, never inside the prop.
 */

import { keyboardTexture, woodTexture } from "@scale_up_game/three/kit/textures";

// One frame colour for windows, doors and boards (dark bronze).
export const FRAME_COLOR = 0x4f4136;

const CRATE_COLORS = [0xc79a62, 0xb98a52, 0xd2a870];

export function makeCrate(scene, size = 0.46, color = CRATE_COLORS[0]) {
    const { THREE } = scene;
    const g = new THREE.Group();
    g.add(scene.box(size, size, size, scene.mat(color)));
    g.add(scene.box(size * 0.16, size * 1.01, size * 1.01, scene.mat(0xe9d3a8), { cast: false }));
    g.add(scene.mesh(
        new THREE.PlaneGeometry(size * 0.34, size * 0.26), scene.mat(0xffffff, { roughness: 0.6 }),
        { x: size * 0.25, y: size * 0.12, z: size / 2 + 0.003, cast: false }));
    return g;
}

const PALLET_H = 0.14;

/** Wooden pallet that can show 0..cols*rows*layers crates: setCount(n). */
export function makePallet(scene, { cols = 2, rows = 2, layers = 3, size = 0.46 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const wood = scene.mat(0xb98c54, { roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
        group.add(scene.box(1.1, 0.03, 0.17, wood, { y: PALLET_H - 0.015, z: -0.46 + i * 0.23 }));
    }
    for (const px of [-0.46, 0, 0.46]) {
        group.add(scene.box(0.12, 0.08, 1.1, wood, { x: px, y: 0.045 }));
    }
    const crates = [];
    for (let l = 0; l < layers; l++) {
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const crate = makeCrate(scene, size, CRATE_COLORS[(l + c + r) % 3]);
                crate.position.set(
                    (c - (cols - 1) / 2) * (size + 0.03), PALLET_H + size / 2 + l * size,
                    (r - (rows - 1) / 2) * (size + 0.03));
                crate.visible = false;
                group.add(crate);
                crates.push(crate);
            }
        }
    }
    const setCount = (n) => crates.forEach((crate, i) => (crate.visible = i < n));
    return { group, crates, capacity: crates.length, setCount };
}

/** Steel rack with a few static crates (decoration). */
export function makeRack(scene, { bays = 3, seed = 1 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const bayW = 1.6;
    const depth = 0.9;
    const len = bays * bayW;
    const upright = scene.mat(0x2f5d8a, { metalness: 0.4, roughness: 0.45 });
    const beam = scene.mat(0xe8742c, { metalness: 0.3, roughness: 0.5 });
    const board = scene.mat(0xb7c3cf, { metalness: 0.25, roughness: 0.55 });
    for (let i = 0; i <= bays; i++) {
        for (const pz of [depth / 2 - 0.05, -depth / 2 + 0.05]) {
            group.add(scene.box(0.08, 2.4, 0.08, upright, { x: -len / 2 + i * bayW, y: 1.2, z: pz }));
        }
    }
    let s = seed;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    [0.9, 1.7].forEach((y) => {
        group.add(scene.box(len, 0.06, depth, board, { y }));
        group.add(scene.box(len, 0.09, 0.05, beam, { y: y - 0.065, z: depth / 2 - 0.03 }));
        group.add(scene.box(len, 0.09, 0.05, beam, { y: y - 0.065, z: -depth / 2 + 0.03 }));
        for (let b = 0; b < bays; b++) {
            const n = 1 + Math.floor(rnd() * 2.4);
            for (let k = 0; k < n; k++) {
                const size = 0.34 + rnd() * 0.2;
                const crate = makeCrate(scene, size, CRATE_COLORS[Math.floor(rnd() * 3)]);
                crate.position.set(-len / 2 + bayW * (b + 0.5) - 0.45 + k * 0.62, y + 0.03 + size / 2, 0);
                group.add(crate);
            }
        }
    });
    return group;
}

/** Office desk with a monitor whose screen is a canvas (draw on it) and a hover/pulse glow. */
export function makeDesk(scene) {
    const { THREE } = scene;
    const group = new THREE.Group();
    // Oak top on a black steel frame, walnut drawer pedestal on the player's side.
    const oak = scene.mat(0xffffff, { map: woodTexture(scene, { base: "#b88a5c", seed: 11 }), roughness: 0.55 });
    const walnut = scene.mat(0xffffff, { map: woodTexture(scene, { base: "#7a5236", seed: 4 }), roughness: 0.6 });
    const steel = scene.mat(0x2a2d33, { roughness: 0.38, metalness: 0.6 });
    const brass = scene.mat(0xc9a25a, { roughness: 0.3, metalness: 0.8 });
    const dark = scene.mat(0x1e2228, { roughness: 0.35, metalness: 0.3 });
    group.add(scene.box(1.7, 0.045, 0.8, oak, { y: 0.787 }));
    group.add(scene.box(1.7, 0.012, 0.8, walnut, { y: 0.759 })); // darker edge under the top
    for (const x of [-0.78, 0.78]) { // two closed steel frames
        for (const z of [-0.34, 0.34]) {
            group.add(scene.box(0.04, 0.74, 0.04, steel, { x, y: 0.38, z }));
        }
        group.add(scene.box(0.04, 0.04, 0.72, steel, { x, y: 0.02, z: 0 }));
        group.add(scene.box(0.04, 0.03, 0.72, steel, { x, y: 0.735, z: 0 }));
    }
    group.add(scene.box(1.52, 0.03, 0.03, steel, { y: 0.72, z: -0.34 }));
    // pedestal: three drawers with brass pulls, on the player's side (+z)
    group.add(scene.box(0.44, 0.6, 0.66, walnut, { x: 0.52, y: 0.37 }));
    for (let i = 0; i < 3; i++) {
        const y = 0.6 - i * 0.19;
        group.add(scene.box(0.4, 0.17, 0.015, oak, { x: 0.52, y, z: 0.335 }));
        group.add(scene.box(0.14, 0.018, 0.025, brass, { x: 0.52, y: y + 0.04, z: 0.35 }));
    }
    // monitor (its geometry is what the glow and the overlay anchors follow)
    group.add(scene.mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.025, 28), steel, { y: 0.822, z: -0.15 }));
    group.add(scene.box(0.05, 0.24, 0.035, steel, { y: 0.94, z: -0.17 }));
    group.add(scene.box(1.0, 0.62, 0.05, dark, { y: 1.3, z: -0.15 }));
    const screen = scene.tex(512, 320);
    group.add(scene.mesh(
        new THREE.PlaneGeometry(0.92, 0.54), scene.basic(0xffffff, { map: screen.texture }),
        { y: 1.3, z: -0.122, cast: false, receive: false }));
    // Hover/attention glow: a bright neon tube in Odoo purple tints around the
    // monitor, with a soft halo. Drawn on a plane just in front of the bezel
    // (so the monitor never hides it) with a hole the size of the monitor, so
    // the monitor itself stays untouched. Animated by updateDeskGlow().
    const glow = new THREE.Group();
    glow.position.set(0, 1.3, -0.118);
    const W = 1.5, H = 1.12, PX = 500; // plane size (m), texture pixels per metre
    const glowTex = scene.tex(W * PX, H * PX, (ctx, w, h) => {
        const rect = (rw, rh) => [(w - rw * PX) / 2, (h - rh * PX) / 2, rw * PX, rh * PX];
        const [x, y, bw, bh] = rect(1.0, 0.62);
        const halo = "#9b4f8e";
        ctx.fillStyle = ctx.shadowColor = halo;
        for (const blur of [50, 50, 35, 35, 20]) { // the halo
            ctx.shadowBlur = blur;
            ctx.fillRect(x, y, bw, bh);
        }
        // the neon tube, from the inside out: a white-hot line hugging the
        // monitor's edge, then a bright purple band (no colour inside the line)
        const inset = 0.008 * PX; // the hole is a hair smaller than the monitor (see below)
        const band = (from, to) => [x - (from + to) / 2, y - (from + to) / 2, bw + from + to, bh + from + to];
        ctx.shadowBlur = 14;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#e0a3d6";
        ctx.strokeRect(...band(2, 8));
        ctx.shadowBlur = 0;
        ctx.lineWidth = inset + 2;
        ctx.strokeStyle = "#fff0fb";
        ctx.strokeRect(...band(-inset, 2));
        // the monitor (a hair smaller, so no gap shows at its edge from an angle)
        ctx.clearRect(...rect(1.0 - 0.016, 0.62 - 0.016));
    });
    const glowMat = scene.basic(0xffffff, {
        map: glowTex.texture, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
    });
    const frame = scene.mesh(new THREE.PlaneGeometry(W, H), glowMat, { cast: false, receive: false });
    frame.renderOrder = 2;
    glow.add(frame);
    glow.children.forEach((mesh) => (mesh.raycast = () => {})); // hover area = the monitor itself
    glow.visible = false;
    group.add(glow);
    // keyboard, mouse on a felt pad
    group.add(scene.box(0.46, 0.018, 0.15, scene.mat(0x2f343c, { roughness: 0.5 }), { y: 0.819, z: 0.17 }));
    const keys = scene.mesh(new THREE.PlaneGeometry(0.44, 0.13), scene.mat(0xffffff, { map: keyboardTexture(scene), roughness: 0.6 }),
        { y: 0.8285, z: 0.17, cast: false });
    keys.rotation.x = -Math.PI / 2;
    group.add(keys);
    group.add(scene.box(0.24, 0.004, 0.2, scene.mat(0x3c4148, { roughness: 0.95 }), { x: 0.42, y: 0.812, z: 0.17 }));
    const mouse = scene.mesh(new THREE.SphereGeometry(0.035, 16, 10), scene.mat(0xe9eaed, { roughness: 0.35 }), { x: 0.42, y: 0.818, z: 0.18 });
    mouse.scale.set(0.85, 0.45, 1.3);
    group.add(mouse);
    // ceramic mug with coffee
    const ceramic = scene.mat(0xf4efe7, { roughness: 0.3 });
    group.add(scene.mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 20), ceramic, { x: -0.62, y: 0.86, z: 0.15 }));
    group.add(scene.mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.005, 20), scene.mat(0x4a2c1a, { roughness: 0.2 }),
        { x: -0.62, y: 0.905, z: 0.15, cast: false }));
    // handle: a vertical ring on the mug's side (the torus already stands in the xy plane)
    group.add(scene.mesh(new THREE.TorusGeometry(0.026, 0.008, 8, 16), ceramic, { x: -0.562, y: 0.86, z: 0.15 }));
    // notebook and pen
    group.add(scene.box(0.22, 0.018, 0.3, scene.mat(0x9c5a43, { roughness: 0.8 }), { x: -0.55, y: 0.818, z: -0.12 }));
    group.add(scene.box(0.205, 0.012, 0.285, scene.mat(0xf6f1e6, { roughness: 0.9 }), { x: -0.548, y: 0.818, z: -0.12 }));
    const pen = scene.mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.15, 8), scene.mat(0x1f3b5c, { roughness: 0.4 }), { x: -0.4, y: 0.815, z: -0.1 });
    pen.rotation.set(Math.PI / 2, 0, 0.4);
    group.add(pen);
    // small succulent
    group.add(scene.mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 16), scene.mat(0xd9d2c6, { roughness: 0.7 }), { x: 0.72, y: 0.845, z: -0.28 }));
    const leafMat = scene.mat(0x6f9a6a, { roughness: 0.7 });
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = scene.mesh(new THREE.SphereGeometry(0.022, 10, 8), leafMat, { x: 0.72 + Math.sin(a) * 0.02, y: 0.9, z: -0.28 + Math.cos(a) * 0.02 });
        leaf.scale.set(0.6, 1.4, 0.6);
        leaf.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
        group.add(leaf);
    }
    const cradle = makeNewtonsCradle(scene);
    // front right: in front of the monitor, left of the succulent, behind the mouse pad
    cradle.group.position.set(0.47, 0.81, -0.05);
    cradle.group.rotation.y = -0.2;
    group.add(cradle.group);
    // Overlay anchors (local): just above the bezel and its glow, and just
    // right of it, vertically centred on the screen.
    const anchors = { top: new THREE.Vector3(0, 1.635, -0.15), side: new THREE.Vector3(0.535, 1.3, -0.15) };
    return { group, screen, glow, glowMats: [glowMat], glowLevel: 0, anchors, tick: cradle.tick };
}

/**
 * Newton's cradle desk toy: five steel balls, the end ones taking turns to
 * swing out, click and pass the move on. tick(t) animates it.
 */
export function makeNewtonsCradle(scene) {
    const { THREE } = scene;
    const group = new THREE.Group();
    // no environment map to reflect: keep it light and only half metallic
    const chrome = scene.mat(0xf2f4f7, { roughness: 0.2, metalness: 0.35 });
    const base = scene.mat(0x2b2520, { roughness: 0.45 });
    const string = scene.mat(0xcfd3d8, { roughness: 0.6 });
    const H = 0.15, R = 0.0155, L = 0.1; // frame height, ball radius, string length
    group.add(scene.box(0.2, 0.014, 0.11, base, { y: 0.007 }));
    for (const x of [-0.085, 0.085]) { // two inverted-U frames
        for (const z of [-0.045, 0.045]) {
            group.add(scene.mesh(new THREE.CylinderGeometry(0.003, 0.003, H, 8), chrome, { x, y: H / 2 + 0.014, z }));
        }
    }
    for (const z of [-0.045, 0.045]) {
        const bar = scene.mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.17, 8), chrome, { y: H + 0.014, z });
        bar.rotation.z = Math.PI / 2;
        group.add(bar);
    }
    const pivots = [];
    for (let i = 0; i < 5; i++) {
        const pivot = new THREE.Group();
        pivot.position.set((i - 2) * R * 2.02, H + 0.014, 0);
        for (const z of [-0.045, 0.045]) { // V-shaped strings
            const len = Math.hypot(L, 0.045);
            const s = scene.mesh(new THREE.CylinderGeometry(0.0007, 0.0007, len, 4), string, { y: -L / 2, z: z / 2, cast: false });
            s.rotation.x = Math.atan2(z, L); // from the bar down to the ball
            pivot.add(s);
        }
        pivot.add(scene.mesh(new THREE.SphereGeometry(R, 18, 14), chrome, { y: -L }));
        group.add(pivot);
        pivots.push(pivot);
    }
    const A = 0.55; // swing amplitude (rad)
    const tick = (t) => {
        const phase = (t * 0.9) % 2; // one swing out and back per unit
        const swing = Math.sin((phase % 1) * Math.PI) * A;
        pivots[4].rotation.z = phase < 1 ? swing : 0;
        pivots[0].rotation.z = phase < 1 ? 0 : -swing;
    };
    tick(0);
    return { group, tick };
}

/** Upholstered visitor chair with a steel frame and armrests. Faces +z. */
export function makeVisitorChair(scene, { color = 0x7a6658 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const steel = scene.mat(0x2a2d33, { roughness: 0.38, metalness: 0.6 });
    const fabric = scene.mat(color, { roughness: 0.95 });
    const seam = scene.mat(0x5c4c41, { roughness: 0.95 });
    // sled frame: two side loops on the floor
    for (const x of [-0.24, 0.24]) {
        group.add(scene.box(0.025, 0.025, 0.5, steel, { x, y: 0.0125, z: 0 }));
        group.add(scene.box(0.025, 0.42, 0.025, steel, { x, y: 0.21, z: 0.23 }));
        group.add(scene.box(0.025, 0.66, 0.025, steel, { x, y: 0.33, z: -0.23 }));
        group.add(scene.box(0.025, 0.025, 0.46, steel, { x, y: 0.64, z: 0 })); // armrest bar
        group.add(scene.box(0.05, 0.025, 0.36, scene.mat(0x4a3a2e, { roughness: 0.5 }), { x, y: 0.66, z: 0.02 })); // wooden arm pad
    }
    // seat cushion with a slightly rounded front edge
    group.add(scene.box(0.46, 0.08, 0.44, fabric, { y: 0.45 }));
    const front = scene.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.46, 16), fabric, { y: 0.45, z: 0.22 });
    front.rotation.z = Math.PI / 2;
    group.add(front);
    group.add(scene.box(0.44, 0.005, 0.005, seam, { y: 0.492, z: 0.0 }));
    // backrest, slightly reclined, with a stitched seam
    const back = new THREE.Group();
    back.position.set(0, 0.5, -0.22);
    back.rotation.x = -0.14;
    back.add(scene.box(0.46, 0.46, 0.07, fabric, { y: 0.23 }));
    const top = scene.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.46, 16), fabric, { y: 0.46 });
    top.rotation.z = Math.PI / 2;
    back.add(top);
    back.add(scene.box(0.42, 0.005, 0.005, seam, { y: 0.25, z: 0.037 }));
    group.add(back);
    return group;
}

/**
 * Animate the monitor glow: breathes while hovered, pulses slowly as a hint,
 * and always fades in/out instead of switching on/off.
 */
export function updateDeskGlow(desk, dt, t, { hover = false, pulse = false } = {}) {
    const target = hover ? 0.85 + 0.15 * Math.sin(t * 3) : pulse ? 0.55 + 0.3 * Math.sin(t * 2.2) : 0;
    desk.glowLevel += (target - desk.glowLevel) * Math.min(1, dt * 6);
    for (const mat of desk.glowMats) {
        mat.opacity = desk.glowLevel;
    }
    desk.glow.visible = desk.glowLevel > 0.01;
}

/**
 * Flatbed delivery truck, front towards +x, cargo visible on the bed.
 * `label` is painted on the side boards; cargo(n) shows n crates on the bed.
 */
export function makeTruck(scene, { color = 0x1f7a4d, label = "Truck" } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const dark = scene.mat(0x22262c, { roughness: 0.5 });
    group.add(scene.box(3.6, 0.14, 1.3, dark, { x: -0.7, y: 0.5 })); // chassis + bed
    group.add(scene.box(3.0, 0.06, 1.25, scene.mat(0xb98c54, { roughness: 0.9 }), { x: -0.9, y: 0.6 }));
    const sign = scene.tex(512, 96, (ctx, w, h) => {
        ctx.fillStyle = "#" + color.toString(16).padStart(6, "0");
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 52px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, w / 2, h / 2);
    });
    for (const z of [0.645, -0.645]) {
        const plane = scene.mesh(new THREE.PlaneGeometry(2.8, 0.42), scene.basic(0xffffff, { map: sign.texture }), { x: -0.9, y: 0.86, z, cast: false });
        plane.rotation.y = z > 0 ? 0 : Math.PI;
        group.add(plane);
    }
    group.add(scene.box(2.9, 0.05, 0.05, dark, { x: -0.9, y: 1.1, z: 0.63 })); // side rails
    group.add(scene.box(2.9, 0.05, 0.05, dark, { x: -0.9, y: 1.1, z: -0.63 }));
    group.add(scene.box(0.08, 1.1, 1.25, dark, { x: 0.7, y: 1.15 })); // headboard
    group.add(scene.box(1.0, 1.15, 1.2, scene.mat(color), { x: 1.45, y: 1.1 })); // cab
    group.add(scene.box(0.05, 0.5, 1.0, scene.mat(0x9fd3e8, { metalness: 0.5, roughness: 0.2 }), { x: 1.97, y: 1.4 }));
    for (const x of [-1.8, -0.8, 1.4]) {
        for (const z of [0.62, -0.62]) {
            const wheel = scene.mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 18), dark, { x, y: 0.34, z });
            wheel.rotation.x = Math.PI / 2;
            group.add(wheel);
        }
    }
    // 5 columns x 2 rows on the bed, a second layer for crates 11-12
    const crates = [];
    for (let i = 0; i < 12; i++) {
        const crate = makeCrate(scene, 0.42, CRATE_COLORS[i % 3]);
        crate.position.set(-1.9 + 0.5 * (i % 5), 0.66 + 0.21 + (i >= 10 ? 0.42 : 0), i % 10 < 5 ? -0.3 : 0.3);
        crate.visible = false;
        group.add(crate);
        crates.push(crate);
    }
    const cargo = (n) => crates.forEach((crate, i) => (crate.visible = i < n));
    return { group, cargo, crates };
}

/** Yellow/black hazard strip painted on the floor (dock lane). */
export function makeHazardStrip(scene, w, d) {
    const { THREE } = scene;
    const { texture } = scene.tex(256, 32, (ctx, cw, ch) => {
        ctx.fillStyle = "#f2c200";
        ctx.fillRect(0, 0, cw, ch);
        ctx.fillStyle = "#222";
        for (let x = -ch; x < cw; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, ch);
            ctx.lineTo(x + 20, ch);
            ctx.lineTo(x + 20 + ch, 0);
            ctx.lineTo(x + ch, 0);
            ctx.fill();
        }
    });
    const m = scene.mesh(new THREE.PlaneGeometry(w, d), scene.basic(0xffffff, { map: texture }), { cast: false, receive: false });
    m.rotation.x = -Math.PI / 2;
    return m;
}

/** Wall board with a canvas to draw on: returns {group, screen}. */
export function makeBoard(scene, w = 2.2, h = 1.3) {
    const { THREE } = scene;
    const group = new THREE.Group();
    // wooden frame; the surface takes the room's light like real paper
    group.add(scene.box(w + 0.1, h + 0.1, 0.05, scene.mat(FRAME_COLOR, { roughness: 0.5, metalness: 0.3 })));
    const screen = scene.tex(512, Math.round((512 * h) / w));
    group.add(scene.mesh(
        new THREE.PlaneGeometry(w, h), scene.mat(0xffffff, {
            map: screen.texture, roughness: 0.9, emissive: 0xffffff, emissiveMap: screen.texture, emissiveIntensity: 0.2,
        }),
        { z: 0.03, cast: false, receive: true }));
    return { group, screen };
}

/** Office chair (static prop). */
export function makeChair(scene, { color = 0x6a5a4f } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const dark = scene.mat(0x24282f, { roughness: 0.5 });
    const seat = scene.mat(color, { roughness: 0.8 });
    group.add(scene.mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 12), dark, { y: 0.17 }));
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const leg = scene.box(0.32, 0.04, 0.06, dark, { x: Math.sin(a) * 0.16, y: 0.05, z: Math.cos(a) * 0.16 });
        leg.rotation.y = a;
        group.add(leg);
    }
    group.add(scene.box(0.46, 0.09, 0.44, seat, { y: 0.4 }));
    const back = scene.box(0.44, 0.5, 0.08, seat, { y: 0.68, z: -0.2 });
    back.rotation.x = -0.12;
    group.add(back);
    return group;
}

/** Filing cabinet with drawers (keep it off the walls that carry a board). */
export function makeCabinet(scene, { w = 0.9, h = 1.0, d = 0.45 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const body = scene.mat(0xffffff, { map: woodTexture(scene, { base: "#8b5e3c", seed: 6 }), roughness: 0.6 });
    const front = scene.mat(0xffffff, { map: woodTexture(scene, { base: "#b07e52", seed: 12 }), roughness: 0.55 });
    const handle = scene.mat(0xc9a25a, { roughness: 0.3, metalness: 0.8 });
    group.add(scene.box(w, h, d, body, { y: h / 2 }));
    const drawers = Math.max(2, Math.round(h / 0.32));
    for (let i = 0; i < drawers; i++) {
        const y = h - (i + 0.5) * (h / drawers);
        group.add(scene.box(w * 0.92, h / drawers - 0.03, 0.02, front, { y, z: d / 2 + 0.01 }));
        group.add(scene.box(w * 0.3, 0.035, 0.03, handle, { y: y - 0.02, z: d / 2 + 0.03 }));
    }
    return group;
}

/** Potted plant. */
export function makePlant(scene) {
    const { THREE } = scene;
    const group = new THREE.Group();
    group.add(scene.mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 16), scene.mat(0xb4745a, { roughness: 0.8 }), { y: 0.15 }));
    group.add(scene.mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 16), scene.mat(0x4a3b2f), { y: 0.3 }));
    // Broad arching leaves (flattened ellipsoids) in two greens, around a few stems.
    const leafMats = [scene.mat(0x4f8a4c, { roughness: 0.6 }), scene.mat(0x6a9f5b, { roughness: 0.6 })];
    const stem = scene.mat(0x5b6b3a, { roughness: 0.8 });
    const arms = [];
    for (let i = 0; i < 14; i++) {
        const a = i * 2.39; // golden angle, so leaves never line up
        const tilt = 0.35 + (i % 4) * 0.18;
        const len = 0.55 + (i % 3) * 0.12;
        const pivot = new THREE.Group();
        pivot.position.set(0, 0.32, 0);
        pivot.rotation.set(0, a, 0);
        const arm = new THREE.Group();
        arm.rotation.x = tilt;
        arm.add(scene.mesh(new THREE.CylinderGeometry(0.008, 0.01, len * 0.55, 6), stem, { y: len * 0.27 }));
        const leaf = scene.mesh(new THREE.SphereGeometry(0.1, 14, 10), leafMats[i % 2], { y: len * 0.62 });
        leaf.scale.set(0.75, 1.9, 0.12);
        arm.add(leaf);
        pivot.add(arm);
        group.add(pivot);
        arms.push({ arm, tilt, phase: i * 0.7 });
    }
    // A barely noticeable sway, each leaf slightly out of step with the others.
    group.userData.tick = (t) => {
        for (const { arm, tilt, phase } of arms) {
            arm.rotation.x = tilt + Math.sin(t * 0.9 + phase) * 0.025;
            arm.rotation.z = Math.sin(t * 0.6 + phase * 1.3) * 0.015;
        }
    };
    return group;
}

/**
 * Window onto a city: sky, drifting clouds and a skyline seen through lightly
 * tinted glass. Every layer is lit, so shadows on the wall run across the
 * window too. Call `group.userData.tick(dt, t)` every frame to move the clouds.
 */
export function makeWindow(scene, { w = 1.6, h = 1.1 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const frame = scene.mat(FRAME_COLOR, { roughness: 0.5, metalness: 0.3 });
    group.add(scene.box(w + 0.12, h + 0.12, 0.06, frame));

    // Deterministic pseudo-random, so the skyline is the same on every load.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

    const sky = scene.tex(64, 256, (ctx, cw, ch) => {
        const g = ctx.createLinearGradient(0, 0, 0, ch);
        g.addColorStop(0, "#3f8fd4");
        g.addColorStop(0.7, "#8cc4ec");
        g.addColorStop(1, "#cfe6f6");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cw, ch);
    });
    const clouds = (count, size, alpha) => {
        const t = scene.tex(512, 256, (ctx, cw, ch) => {
            for (let i = 0; i < count; i++) {
                const cx = rnd() * cw, cy = ch * (0.1 + rnd() * 0.3), r = size * (0.7 + rnd() * 0.6);
                // a cloud = a few overlapping soft puffs; drawn twice across the
                // seam so the texture tiles horizontally
                for (const dx of [0, -cw, cw]) {
                    for (let k = 0; k < 5; k++) {
                        const px = cx + dx + (k - 2) * r * 0.55, py = cy + (k % 2 ? -r * 0.18 : r * 0.08);
                        const pr = r * (k === 2 ? 0.75 : 0.5);
                        const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
                        g.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
                        g.addColorStop(1, "rgba(255, 255, 255, 0)");
                        ctx.fillStyle = g;
                        ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
                    }
                }
            }
        });
        t.texture.wrapS = THREE.RepeatWrapping;
        return t.texture;
    };
    const skyline = scene.tex(512, 256, (ctx, cw, ch) => {
        const row = (base, minH, maxH, color, lit) => {
            let x = -10;
            while (x < cw) {
                const bw = 26 + rnd() * 46, bh = minH + rnd() * (maxH - minH), top = ch - base - bh;
                ctx.fillStyle = color;
                ctx.fillRect(x, top, bw, bh + base);
                if (rnd() < 0.3) { // antenna
                    ctx.fillRect(x + bw / 2 - 1, top - 14, 2, 14);
                }
                if (lit) { // window grid, some lit
                    for (let wy = top + 6; wy < ch - 8; wy += 9) {
                        for (let wx = x + 5; wx < x + bw - 6; wx += 8) {
                            ctx.fillStyle = rnd() < 0.18 ? "rgba(255, 233, 168, 0.9)" : "rgba(210, 228, 245, 0.35)";
                            ctx.fillRect(wx, wy, 4, 5);
                        }
                    }
                }
                x += bw + 2 + rnd() * 10;
            }
        };
        row(0, 110, 200, "#8aa2bb", false); // far towers, hazy
        row(0, 50, 150, "#4b5f76", true); // near towers
    });

    // Half lit (so shadows show on it), half self-lit (it's daylight outside).
    const layer = (map, z, { emissive = 0.5, transparent = true, order = 0 } = {}) => {
        const mesh = scene.mesh(new THREE.PlaneGeometry(w, h), scene.mat(0x9a9a9a, {
            map, transparent, depthWrite: !transparent, roughness: 1, metalness: 0,
            emissive: 0xffffff, emissiveMap: map, emissiveIntensity: emissive,
        }), { z, cast: false, receive: true });
        mesh.renderOrder = order;
        group.add(mesh);
        return mesh;
    };
    layer(sky.texture, 0.031, { transparent: false });
    const farClouds = clouds(6, 34, 0.75);
    const nearClouds = clouds(4, 52, 0.95);
    layer(farClouds, 0.033, { order: 1 });
    layer(nearClouds, 0.035, { order: 2 });
    layer(skyline.texture, 0.038, { emissive: 0.4, order: 3 });

    // Glass: faint blue tint plus two diagonal reflections.
    const sheen = scene.tex(256, 256, (ctx, cw, ch) => {
        ctx.fillStyle = "rgba(220, 238, 250, 0.18)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.rotate(-0.6);
        for (const [x, width, alpha] of [[60, 34, 0.22], [120, 12, 0.16]]) {
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.fillRect(x, -cw, width, ch * 3);
        }
    });
    const glass = scene.mesh(new THREE.PlaneGeometry(w, h), scene.mat(0xffffff, {
        map: sheen.texture, transparent: true, depthWrite: false, roughness: 0.1, metalness: 0.1,
    }), { z: 0.05, cast: false, receive: true });
    glass.renderOrder = 4;
    group.add(glass);

    group.add(scene.box(0.05, h, 0.03, frame, { z: 0.06 }));
    group.add(scene.box(w, 0.05, 0.03, frame, { z: 0.06 }));

    // Clouds drift at two speeds (parallax) and float gently up and down.
    group.userData.tick = (dt, t) => {
        farClouds.offset.x = (farClouds.offset.x + dt * 0.004) % 1;
        nearClouds.offset.x = (nearClouds.offset.x + dt * 0.009) % 1;
        farClouds.offset.y = Math.sin(t * 0.25) * 0.01;
        nearClouds.offset.y = Math.sin(t * 0.35 + 1) * 0.015;
    };
    return group;
}

/** Stack of paper sheets (the vendor bill on the desk, a report…). */
export function makePapers(scene, { sheets = 4, color = 0xffffff } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    for (let i = 0; i < sheets; i++) {
        const sheet = scene.box(0.26, 0.004, 0.34, scene.mat(color, { roughness: 0.9 }), { y: i * 0.006 });
        sheet.rotation.y = (i - sheets / 2) * 0.03;
        group.add(sheet);
    }
    return group;
}
