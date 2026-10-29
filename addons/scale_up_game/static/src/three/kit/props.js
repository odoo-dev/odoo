/**
 * Reusable props. Each factory takes the scene (for materials/helpers) and
 * returns a THREE.Group (plus handles when the prop has a dynamic part).
 * Positions/rotations are set by the layout, never inside the prop.
 */

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
    const wood = scene.mat(0xa9774a, { roughness: 0.7 });
    const dark = scene.mat(0x2b303b, { roughness: 0.4 });
    group.add(scene.box(1.7, 0.06, 0.8, wood, { y: 0.78 }));
    for (const [x, z] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]]) {
        group.add(scene.box(0.06, 0.75, 0.06, dark, { x, y: 0.375, z }));
    }
    group.add(scene.box(0.5, 0.55, 0.7, scene.mat(0x8d633d), { x: 0.55, y: 0.45 }));
    group.add(scene.mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 20), dark, { y: 0.83, z: -0.15 }));
    group.add(scene.box(0.05, 0.22, 0.05, dark, { y: 0.93, z: -0.15 }));
    group.add(scene.box(1.0, 0.62, 0.05, dark, { y: 1.3, z: -0.15 }));
    const screen = scene.tex(512, 320);
    group.add(scene.mesh(
        new THREE.PlaneGeometry(0.92, 0.54), scene.basic(0xffffff, { map: screen.texture }),
        { y: 1.3, z: -0.122, cast: false, receive: false }));
    const glow = scene.mesh(
        new THREE.BoxGeometry(1.12, 0.74, 0.1), scene.basic(0x2fe0d2, { transparent: true, opacity: 0, depthWrite: false }),
        { y: 1.3, z: -0.15, cast: false, receive: false });
    glow.visible = false;
    group.add(glow);
    group.add(scene.box(0.52, 0.025, 0.18, scene.mat(0xdfe3ea), { y: 0.82, z: 0.18 }));
    group.add(scene.mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14), scene.mat(0xff9f1c), { x: -0.62, y: 0.86, z: 0.15 }));
    group.add(scene.box(0.26, 0.02, 0.34, scene.mat(0xffffff), { x: -0.55, y: 0.815, z: -0.15 }));
    return { group, screen, glow };
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
    group.add(scene.box(w + 0.1, h + 0.1, 0.05, scene.mat(0x2b303b)));
    const screen = scene.tex(512, Math.round((512 * h) / w));
    group.add(scene.mesh(
        new THREE.PlaneGeometry(w, h), scene.basic(0xffffff, { map: screen.texture }),
        { z: 0.03, cast: false, receive: false }));
    return { group, screen };
}

/** Office chair (static prop). */
export function makeChair(scene, { color = 0x3a4250 } = {}) {
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
export function makeCabinet(scene, { w = 0.9, h = 1.0, d = 0.45, color = 0xb9c0c8 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const body = scene.mat(color, { roughness: 0.6, metalness: 0.15 });
    const handle = scene.mat(0x5b6570, { roughness: 0.4, metalness: 0.5 });
    group.add(scene.box(w, h, d, body, { y: h / 2 }));
    const drawers = Math.max(2, Math.round(h / 0.32));
    for (let i = 0; i < drawers; i++) {
        const y = h - (i + 0.5) * (h / drawers);
        group.add(scene.box(w * 0.92, h / drawers - 0.03, 0.02, scene.mat(0xd7dde2, { roughness: 0.55 }), { y, z: d / 2 + 0.01 }));
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
    const leafMat = scene.mat(0x3f8d52, { roughness: 0.75 });
    for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const h = 0.4 + (i % 3) * 0.18;
        const leaf = scene.mesh(new THREE.ConeGeometry(0.09, h, 7), leafMat, {
            x: Math.sin(a) * 0.1, y: 0.32 + h / 2, z: Math.cos(a) * 0.1,
        });
        leaf.rotation.set(Math.cos(a) * 0.35, a, -Math.sin(a) * 0.35);
        group.add(leaf);
    }
    return group;
}

/** Window with a frame and a bright pane (wall decoration). */
export function makeWindow(scene, { w = 1.6, h = 1.1 } = {}) {
    const { THREE } = scene;
    const group = new THREE.Group();
    const frame = scene.mat(0xf2f4f7, { roughness: 0.6 });
    group.add(scene.box(w + 0.12, h + 0.12, 0.06, frame));
    group.add(scene.mesh(new THREE.PlaneGeometry(w, h), scene.basic(0xbfe3f5), { z: 0.05, cast: false, receive: false }));
    group.add(scene.box(0.05, h, 0.03, frame, { z: 0.06 }));
    group.add(scene.box(w, 0.05, 0.03, frame, { z: 0.06 }));
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
