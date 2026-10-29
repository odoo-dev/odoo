import { Aborted, Animator, faceTowards, runRestockSequence, walkTo } from "@scale_up_game/three/animations";
import { ActivityDirector } from "@scale_up_game/three/activities";

/** Stable frontend identifiers of the important scene objects. */
export const SCENE_OBJECT_IDS = {
    worker: "warehouse_worker_01",
    shelf: "shelf_01",
    box: "product_box_01",
    floor: "warehouse_floor_01",
    terminal: "office_terminal_01",
};

const CAMERA_TARGET = [0.5, 0.9, -0.4];
const CAMERA_OFFSET = [6.5, 6.5, 8.5];
const SHELF_Z = -3.1;
const BOARD_Y = 0.9; // centre of the lower rack board
const BOARD_T = 0.06;
const BOX_SIZE = 0.7;
const PALLET_H = 0.14;
const DESK = { x: -3.3, z: -2.8 };

function rng(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, r);
    } else {
        ctx.rect(x, y, w, h);
    }
}

function fitFont(ctx, text, maxWidth, size, weight = "bold") {
    let px = size;
    ctx.font = `${weight} ${px}px sans-serif`;
    while (px > 14 && ctx.measureText(text).width > maxWidth) {
        px -= 2;
        ctx.font = `${weight} ${px}px sans-serif`;
    }
}

function wrapLines(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const word of String(text).split(" ")) {
        const test = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(test).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) {
        lines.push(line);
    }
    return lines;
}

/**
 * Presentation layer only: renders and animates. It never decides what the
 * stock is - callers pass values that Odoo has confirmed.
 */
export class WarehouseScene {
    constructor(THREE, container, { onFrame, onActivity } = {}) {
        this.THREE = THREE;
        this.container = container;
        this.onFrame = onFrame;
        this.onActivity = onActivity;
        this.animator = new Animator();
        this.shelfStock = 0;
        this.animating = false;
        this.disposed = false;
        this.zoom = 1;
        this._mode = "idle"; // free | waiting | busy | idle
        this._ctx = null;
        this._hoverId = null;
        this._pulse = false;
        this._confetti = [];
        this._materials = [];
        this._textures = [];
        this._names = { product: "Product", shelf: "Shelf-01", source: "WH/Stock" };
        this._boardDone = false;
        this._srcQty = 1;
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        this.layout = {
            workerIdle: V(-1.0, 0, -1.8),
            workerAtBox: V(-2.1, 0, 1.3),
            workerAtShelf: V(2.0, 0, -1.9),
            boxSource: V(-3.0, PALLET_H + BOX_SIZE / 2, 1.3),
            shelfSlot: V(2.0, BOARD_Y + BOARD_T / 2 + BOX_SIZE / 2, SHELF_Z),
            carryOffset: V(0, 0.65, 0.6), // local to the worker
            spots: {
                rack: { stand: V(-4.4, 0, -0.2), look: V(-5.6, 0.9, -0.2) },
                desk: { stand: V(DESK.x, 0, -1.6), look: V(DESK.x, 0.9, DESK.z) },
                pallets: { stand: V(2.9, 0, 1.3), look: V(4.2, 0.9, 1.3) },
                source: { stand: V(-1.9, 0, 2.3), look: V(-3.0, 0.4, 1.3) },
                shelf: { stand: V(2.0, 0, -1.9), look: V(2.0, 1.2, SHELF_Z) },
                centre: { stand: V(0.6, 0, 0.6) },
            },
        };

        this._initRenderer();
        this._buildLights();
        this._buildFloor();
        this._buildRoom();
        this._buildWindows();
        this._buildRack({ x: 2.0, z: SHELF_Z, bays: 3, emptyBay: 1, seed: 11, plaque: true });
        this._buildRack({ x: -5.55, z: -0.2, rotY: Math.PI / 2, bays: 3, seed: 23 });
        this._buildPallet(-3.0, 1.3, { seed: 2 });
        this._buildPallet(4.2, 0.4, { seed: 5, stack: [2, 2, 2] });
        this._buildPallet(4.2, 2.3, { seed: 8, stack: [2, 1, 3] });
        this._buildProps();
        this._buildDesk();
        this._buildWallDecor();
        this._buildBox();
        this._buildWorker();
        this._buildStockLabel();
        this._buildDust();
        this.interactives = [this.worker.group, this.terminal.group];

        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(container);
        this._onWheel = (ev) => {
            ev.preventDefault();
            this.zoom = Math.min(1.4, Math.max(0.6, this.zoom + Math.sign(ev.deltaY) * 0.06));
            this._updateCamera();
        };
        this.renderer.domElement.addEventListener("wheel", this._onWheel, { passive: false });

        this.director = new ActivityDirector(this);
        this._resize();
        this._clock = new THREE.Clock();
        this._loop = this._loop.bind(this);
        this._raf = requestAnimationFrame(this._loop);
    }

    // ------------------------------------------------------------------
    // Public API (visual state only)
    // ------------------------------------------------------------------
    /** Set the displayed shelf stock from CONFIRMED server data. */
    setShelfStock(quantity) {
        this.shelfStock = quantity;
        this._drawLabel(quantity);
        if (!this.animating) {
            this._snapBox(quantity >= 1);
        }
    }

    setWorkerState(state) {
        this.worker.state = state; // idle walk carry reach scan inspect wave celebrate
    }

    /** Hover feedback for the worker / terminal (null clears). */
    setHover(id) {
        this._hoverId = id;
        const on = id === SCENE_OBJECT_IDS.worker;
        for (const m of this.worker.highlightMats) {
            m.emissive.setHex(on ? 0x0b6f73 : 0x000000);
        }
    }

    setTerminalPulse(on) {
        this._pulse = on;
    }

    /** What the terminal screen shows (reflects the document stage). */
    setTerminalStatus({ title = "Inventory", lines = [], color = "#714b67" } = {}) {
        const { ctx, canvas, texture } = this._screen;
        ctx.fillStyle = "#101820";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, canvas.width, 54);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 30px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(title, 20, 38);
        ctx.font = "26px sans-serif";
        ctx.fillStyle = "#8ef3ea";
        lines.slice(0, 5).forEach((line, i) => ctx.fillText(line, 20, 100 + i * 40));
        texture.needsUpdate = true;
    }

    /** Product / location names from Odoo, drawn on the box, shelf sign and order board. */
    setLabels(names) {
        Object.assign(this._names, names);
        this._drawLabel(this.shelfStock);
        this.setOrderBoard(this._boardDone);
        this._drawBoxLabel();
        this._drawBoxTag();
        this._drawPlaque();
    }

    setSourceStock(quantity) {
        this._srcQty = quantity;
        this._drawBoxTag();
    }

    setOrderBoard(done) {
        this._boardDone = done;
        const { ctx, canvas, texture } = this._board;
        ctx.fillStyle = "#fbfbfd";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#714b67";
        ctx.fillRect(0, 0, canvas.width, 84);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 54px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("CUSTOMER ORDERS", 32, 60);
        const row = (y, ref, text, pill, color, strong) => {
            ctx.textAlign = "left";
            ctx.fillStyle = strong ? "#1b1f27" : "#8a919b";
            ctx.font = "bold 40px sans-serif";
            ctx.fillText(ref, 32, y);
            fitFont(ctx, text, 330, 36, strong ? "bold" : "normal");
            ctx.fillText(text, 200, y);
            ctx.fillStyle = color;
            roundRect(ctx, 562, y - 42, 316, 58, 28);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 26px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(pill, 720, y - 3);
        };
        row(190, "SO-001", `${this._names.product} × 1`, done ? "READY TO SHIP ✔" : "WAITING FOR STOCK",
            done ? "#017e84" : "#e8742c", true);
        row(300, "SO-000", "3 units", "SHIPPED ✔", "#9aa3ad", false);
        row(410, "SO-002", "2 units", "PACKING", "#4a7bd0", false);
        texture.needsUpdate = true;
    }

    /** Worker walks to the box and waits there (transfer reserved). */
    async waitAtBox(animate) {
        if (this._mode === "waiting") {
            return;
        }
        this._interrupt();
        this._mode = "waiting";
        const ctx = (this._ctx = { aborted: false });
        const g = this.worker.group;
        const target = this.layout.workerAtBox;
        try {
            if (animate) {
                await walkTo(this, target, "walk", ctx);
                await faceTowards(this.animator, g, this.box.group.position);
                if (ctx.aborted) {
                    return;
                }
            } else {
                g.position.set(target.x, 0, target.z);
                g.rotation.y = Math.atan2(this.box.group.position.x - target.x, this.box.group.position.z - target.z);
            }
            this.setWorkerState("idle");
            this.onActivity?.("Waiting for the transfer to be validated…");
        } catch (e) {
            if (!(e instanceof Aborted)) {
                throw e;
            }
        }
    }

    /** Transfer validated: carry the box to the shelf, then celebrate. */
    async deliver() {
        this._interrupt();
        this._mode = "busy";
        this.onActivity?.(null);
        this.animating = true;
        try {
            await runRestockSequence(this);
        } finally {
            this.animating = false;
        }
        this.setShelfStock(Math.max(this.shelfStock, 1));
        await this._celebrate();
        this.startWorking();
    }

    /** Let the worker go about its business (random activities). */
    startWorking() {
        if (this._mode === "free" && this.director.active) {
            return;
        }
        this._interrupt();
        this._mode = "free";
        this.setWorkerState("idle");
        this.director.start();
    }

    getScreenPosition(name) {
        const { THREE } = this;
        const p = this.worker.group.position;
        const v =
            name === "terminal"
                ? new THREE.Vector3(DESK.x, 1.75, DESK.z)
                : new THREE.Vector3(p.x, p.y + 1.55, p.z);
        v.project(this.camera);
        return {
            x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
            y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
        };
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this._interrupt();
        cancelAnimationFrame(this._raf);
        this.animator.cancelAll();
        this._resizeObserver.disconnect();
        this.renderer.domElement.removeEventListener("wheel", this._onWheel);
        this.scene.traverse((obj) => {
            obj.geometry?.dispose();
        });
        this._confettiGeo?.dispose();
        for (const m of this._materials) {
            m.dispose();
        }
        for (const t of this._textures) {
            t.dispose();
        }
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
        this.renderer.domElement.remove();
    }

    // ------------------------------------------------------------------
    // Internals: control
    // ------------------------------------------------------------------
    _interrupt() {
        if (this._ctx) {
            this._ctx.aborted = true;
        }
        this.director?.stop();
    }

    async _celebrate() {
        this._burstConfetti();
        this.setWorkerState("celebrate");
        const g = this.worker.group;
        const y0 = g.rotation.y;
        await this.animator.tween(1.8, (k) => {
            g.rotation.y = y0 + k * Math.PI * 4;
            this.worker.hop = Math.abs(Math.sin(k * Math.PI * 4)) * 0.18;
        });
        this.worker.hop = 0;
        this.setWorkerState("idle");
    }

    _burstConfetti() {
        const { THREE } = this;
        if (!this._confettiMats) {
            this._confettiMats = [0x714b67, 0x017e84, 0xff9f1c, 0xf4f1f6, 0xe74c3c].map((c) => {
                const m = new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide });
                this._materials.push(m);
                return m;
            });
            this._confettiGeo = new THREE.PlaneGeometry(0.1, 0.06);
        }
        for (let i = 0; i < 110; i++) {
            const mesh = new THREE.Mesh(this._confettiGeo, this._confettiMats[i % this._confettiMats.length]);
            mesh.position.set(Math.random() * 7 - 2, 3.5 + Math.random() * 1.5, Math.random() * 5 - 3);
            mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            this.scene.add(mesh);
            this._confetti.push({
                mesh,
                vy: -(0.7 + Math.random() * 1.0),
                spin: (Math.random() - 0.5) * 8,
                phase: Math.random() * 6,
                life: 4 + Math.random() * 1.5,
            });
        }
    }

    _snapBox(onShelf) {
        const g = this.box.group;
        if (g.parent !== this.scene) {
            this.scene.attach(g);
        }
        g.quaternion.identity();
        g.position.copy(onShelf ? this.layout.shelfSlot : this.layout.boxSource);
    }

    // ------------------------------------------------------------------
    // Internals: setup
    // ------------------------------------------------------------------
    _mat(color, opts = {}) {
        const m = new this.THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });
        this._materials.push(m);
        return m;
    }

    _basic(color, opts = {}) {
        const m = new this.THREE.MeshBasicMaterial({ color, ...opts });
        this._materials.push(m);
        return m;
    }

    _mesh(geometry, material, { x = 0, y = 0, z = 0, cast = true, receive = true } = {}) {
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        return mesh;
    }

    _box(w, h, d, material, pos = {}) {
        return this._mesh(new this.THREE.BoxGeometry(w, h, d), material, pos);
    }

    /** Canvas texture helper: returns {texture, canvas, ctx}. */
    _tex(w, h, draw) {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        draw?.(ctx, w, h);
        const texture = new this.THREE.CanvasTexture(canvas);
        texture.anisotropy = 4;
        this._textures.push(texture);
        return { texture, canvas, ctx };
    }

    _initRenderer() {
        const { THREE } = this;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        this.renderer.domElement.style.display = "block";
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xd9e1ea);
        this.scene.fog = new THREE.Fog(0xd9e1ea, 22, 40);
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        this._updateCamera();
    }

    _updateCamera() {
        const t = CAMERA_TARGET;
        const o = CAMERA_OFFSET;
        this.camera.position.set(t[0] + o[0] * this.zoom, t[1] + o[1] * this.zoom, t[2] + o[2] * this.zoom);
        this.camera.lookAt(t[0], t[1], t[2]);
    }

    _resize() {
        const w = Math.max(this.container.clientWidth, 1);
        const h = Math.max(this.container.clientHeight, 1);
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    _buildLights() {
        const { THREE } = this;
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2c8, 0.7));
        const sun = new THREE.DirectionalLight(0xfff0d2, 0.95); // warm, from the windows side
        sun.position.set(-5, 9, 5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const c = sun.shadow.camera;
        c.left = -10;
        c.right = 10;
        c.top = 10;
        c.bottom = -10;
        c.near = 1;
        c.far = 30;
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0xcfe0ff, 0.25);
        fill.position.set(6, 5, 8);
        this.scene.add(fill);
    }

    _buildFloor() {
        const { THREE } = this;
        const tiles = this._tex(512, 512, (ctx, w, h) => {
            const r = rng(7);
            for (let i = 0; i < 8; i++) {
                for (let j = 0; j < 8; j++) {
                    const v = Math.floor(190 + r() * 16);
                    ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`;
                    ctx.fillRect(i * 64, j * 64, 64, 64);
                }
            }
            ctx.strokeStyle = "rgba(80,92,112,0.35)";
            ctx.lineWidth = 2;
            for (let i = 0; i <= 8; i++) {
                ctx.beginPath();
                ctx.moveTo(i * 64, 0);
                ctx.lineTo(i * 64, h);
                ctx.moveTo(0, i * 64);
                ctx.lineTo(w, i * 64);
                ctx.stroke();
            }
        });
        tiles.texture.wrapS = tiles.texture.wrapT = THREE.RepeatWrapping;
        tiles.texture.repeat.set(2, 1.43);
        const floor = this._mesh(
            new THREE.PlaneGeometry(12, 8.6), this._mat(0xffffff, { map: tiles.texture, roughness: 0.9 }),
            { y: 0, z: 0.7, cast: false });
        floor.rotation.x = -Math.PI / 2;
        floor.userData.interactiveId = SCENE_OBJECT_IDS.floor;
        this.scene.add(floor);
        this.scene.add(this._box(12.4, 0.3, 9.0, this._mat(0x5b6270), { y: -0.16, z: 0.7, cast: false }));

        const decal = (w, d, x, z, cw, ch, draw, rotY = 0) => {
            const t = this._tex(cw, ch, draw);
            const m = this._mesh(
                new THREE.PlaneGeometry(w, d),
                this._basic(0xffffff, {
                    map: t.texture, transparent: true, depthWrite: false,
                    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
                }),
                { x, y: 0.006, z, cast: false, receive: false });
            m.rotation.x = -Math.PI / 2;
            m.rotation.z = rotY;
            this.scene.add(m);
        };
        // "Stock in" bay under the source pallet
        decal(2.1, 2.1, -3.0, 1.3, 256, 256, (ctx, w, h) => {
            ctx.strokeStyle = "#f2c200";
            ctx.lineWidth = 12;
            ctx.strokeRect(10, 10, w - 20, h - 20);
            ctx.fillStyle = "#f2c200";
            ctx.font = "bold 34px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("STOCK IN", w / 2, h - 24);
        });
        // Hazard stripe in front of the main rack
        decal(4.8, 0.3, 2.0, -2.45, 512, 32, (ctx, w, h) => {
            ctx.fillStyle = "#f2c200";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#222";
            for (let x = -h; x < w; x += 44) {
                ctx.beginPath();
                ctx.moveTo(x, h);
                ctx.lineTo(x + 22, h);
                ctx.lineTo(x + 22 + h, 0);
                ctx.lineTo(x + h, 0);
                ctx.fill();
            }
        });
        // Teal aisle line
        decal(0.16, 6.5, -1.6, 0.9, 16, 256, (ctx, w, h) => {
            ctx.fillStyle = "#017e84";
            for (let y = 0; y < h; y += 40) {
                ctx.fillRect(0, y, w, 26);
            }
        });
    }

    _buildRoom() {
        const wall = this._mat(0xf4f1f6);
        const dado = this._mat(0xcfc7d6);
        this.scene.add(this._box(12.4, 4, 0.2, wall, { y: 2, z: -3.7 }));
        this.scene.add(this._box(0.2, 4, 9.0, wall, { x: -6.1, y: 2, z: 0.7 }));
        this.scene.add(this._box(12, 1.0, 0.06, dado, { y: 0.5, z: -3.57, cast: false }));
        this.scene.add(this._box(0.06, 1.0, 8.6, dado, { x: -5.97, y: 0.5, z: 0.7, cast: false }));
        const purple = this._mat(0x714b67);
        this.scene.add(this._box(12, 0.22, 0.06, purple, { y: 3.75, z: -3.57, cast: false }));
        this.scene.add(this._box(0.06, 0.22, 8.6, purple, { x: -5.97, y: 3.75, z: 0.7, cast: false }));
    }

    _buildWindows() {
        const { THREE } = this;
        const frame = this._mat(0x39414f, { metalness: 0.4 });
        const sky = this._tex(8, 128, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, "#8fcaff");
            g.addColorStop(1, "#eef8ff");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
        });
        const beamMat = this._basic(0xfff1c0, {
            transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        for (const zc of [-1.6, 1.8]) {
            const glass = this._mesh(new THREE.PlaneGeometry(1.5, 1.2), this._basic(0xffffff, { map: sky.texture }), {
                x: -5.94, y: 3.0, z: zc, cast: false, receive: false });
            glass.rotation.y = Math.PI / 2;
            this.scene.add(glass);
            for (const [w, h, d, y, z] of [
                [0.1, 0.08, 1.64, 3.64, 0], [0.1, 0.08, 1.64, 2.36, 0], [0.1, 1.28, 0.08, 3.0, -0.78],
                [0.1, 1.28, 0.08, 3.0, 0.78], [0.1, 1.2, 0.05, 3.0, 0], [0.1, 0.05, 1.5, 3.0, 0],
            ]) {
                this.scene.add(this._box(w, h, d, frame, { x: -5.94, y, z: zc + z, cast: false }));
            }
            // light shaft: slanted sheets from the window edges to the floor
            for (const [y0] of [[3.6], [2.4]]) {
                const g = new THREE.BufferGeometry();
                const v = [
                    -5.9, y0, zc - 0.75, -5.9, y0, zc + 0.75, -2.7, 0.01, zc + 1.35,
                    -5.9, y0, zc - 0.75, -2.7, 0.01, zc + 1.35, -2.7, 0.01, zc - 0.15,
                ];
                g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
                this.scene.add(new THREE.Mesh(g, beamMat));
            }
        }
    }

    _crate(w, h, d, color, withLabel = true) {
        const { THREE } = this;
        const g = new THREE.Group();
        g.add(this._box(w, h, d, this._mat(color)));
        g.add(this._box(w * 0.16, h * 1.01, d * 1.01, this._mat(0xe9d3a8), { cast: false }));
        if (withLabel) {
            const label = this._mesh(
                new THREE.PlaneGeometry(w * 0.34, h * 0.26), this._mat(0xffffff, { roughness: 0.6 }),
                { x: w * 0.25, y: h * 0.12, z: d / 2 + 0.003, cast: false });
            g.add(label);
        }
        return g;
    }

    _makeProductBox() {
        const group = this._crate(BOX_SIZE, BOX_SIZE, BOX_SIZE, 0xc79a62, false);
        this._boxArt = this._tex(256, 256);
        const label = this._mesh(
            new this.THREE.PlaneGeometry(BOX_SIZE * 0.84, BOX_SIZE * 0.84), this._basic(0xffffff, { map: this._boxArt.texture }),
            { x: 0, y: 0, z: BOX_SIZE / 2 + 0.006, cast: false, receive: false });
        group.add(label);
        group.userData.interactiveId = SCENE_OBJECT_IDS.box;
        this._drawBoxLabel();
        return group;
    }

    _drawBoxLabel() {
        const { ctx, canvas, texture } = this._boxArt;
        const w = canvas.width;
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "#714b67";
        ctx.fillRect(0, 0, w, 48);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("↑↑ THIS WAY UP", w / 2, 34);
        ctx.fillStyle = "#1b1f27";
        ctx.font = "bold 44px sans-serif";
        const lines = wrapLines(ctx, this._names.product, w - 30).slice(0, 3);
        lines.forEach((line, i) => ctx.fillText(line, w / 2, 120 + i * 52));
        texture.needsUpdate = true;
    }

    _drawBoxTag() {
        const { ctx, canvas, texture } = this._boxTag;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = this._srcQty > 0 ? "#e8742c" : "#7f8793";
        roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 22);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        fitFont(ctx, this._names.product, canvas.width - 40, 38);
        ctx.fillText(this._names.product, canvas.width / 2, 54);
        ctx.font = "26px sans-serif";
        const q = Number.isInteger(this._srcQty) ? this._srcQty : Math.round(this._srcQty * 100) / 100;
        ctx.fillText(`${this._names.source}: ${q}`, canvas.width / 2, 94);
        texture.needsUpdate = true;
    }

    _drawPlaque() {
        const { ctx, canvas, texture } = this._plaque;
        ctx.fillStyle = "#017e84";
        roundRect(ctx, 2, 2, canvas.width - 4, canvas.height - 4, 12);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";
        fitFont(ctx, this._names.shelf.toUpperCase(), canvas.width - 24, 36);
        ctx.fillText(this._names.shelf.toUpperCase(), canvas.width / 2, 44);
        texture.needsUpdate = true;
    }

    _buildRack({ x, z, rotY = 0, bays = 3, emptyBay = -1, seed = 1, plaque = false }) {
        const { THREE } = this;
        const R = rng(seed);
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotY;
        const bayW = 1.6;
        const depth = 0.9;
        const len = bays * bayW;
        const upright = this._mat(0x2f5d8a, { metalness: 0.4, roughness: 0.45 });
        const beam = this._mat(0xe8742c, { metalness: 0.3, roughness: 0.5 });
        const board = this._mat(0xb7c3cf, { metalness: 0.25, roughness: 0.55 });
        for (let i = 0; i <= bays; i++) {
            const px = -len / 2 + i * bayW;
            for (const pz of [depth / 2 - 0.05, -depth / 2 + 0.05]) {
                group.add(this._box(0.08, 2.4, 0.08, upright, { x: px, y: 1.2, z: pz }));
            }
        }
        const palette = [0xc79a62, 0xb98a52, 0xd2a870, 0xe9e4da, 0x3f78b5, 0xd9b17a];
        [BOARD_Y, 1.7].forEach((y, lvl) => {
            group.add(this._box(len, BOARD_T, depth, board, { y }));
            group.add(this._box(len, 0.09, 0.05, beam, { y: y - 0.065, z: depth / 2 - 0.03 }));
            group.add(this._box(len, 0.09, 0.05, beam, { y: y - 0.065, z: -depth / 2 + 0.03 }));
            for (let b = 0; b < bays; b++) {
                if (lvl === 0 && b === emptyBay) {
                    continue;
                }
                const cx = -len / 2 + bayW * (b + 0.5);
                let cursor = -bayW / 2 + 0.12;
                const n = 1 + Math.floor(R() * 2.4);
                for (let k = 0; k < n; k++) {
                    const w = 0.34 + R() * 0.24;
                    if (cursor + w > bayW / 2 - 0.08) {
                        break;
                    }
                    const h = Math.min(0.7, w * (0.7 + R() * 0.6));
                    const crate = this._crate(w, h, 0.5 + R() * 0.2, palette[Math.floor(R() * palette.length)]);
                    crate.position.set(cx + cursor + w / 2, y + BOARD_T / 2 + h / 2, (R() - 0.5) * 0.08);
                    group.add(crate);
                    cursor += w + 0.05 + R() * 0.08;
                }
            }
        });
        if (plaque) {
            const t = this._tex(256, 64);
            this._plaque = t;
            this._drawPlaque();
            const p = this._mesh(new THREE.PlaneGeometry(0.8, 0.2), this._basic(0xffffff, { map: t.texture }), {
                x: -len / 2 + bayW * (emptyBay + 0.5), y: BOARD_Y - 0.065, z: depth / 2 + 0.001,
                cast: false, receive: false });
            group.add(p);
            group.userData.interactiveId = SCENE_OBJECT_IDS.shelf;
        }
        this.scene.add(group);
        return group;
    }

    _buildPallet(x, z, { seed = 1, stack = null, rotY = 0 } = {}) {
        const { THREE } = this;
        const R = rng(seed);
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        group.rotation.y = rotY;
        const wood = this._mat(0xb98c54, { roughness: 0.9 });
        for (let i = 0; i < 5; i++) {
            group.add(this._box(1.1, 0.03, 0.17, wood, { y: PALLET_H - 0.015, z: -0.46 + i * 0.23 }));
        }
        for (const px of [-0.46, 0, 0.46]) {
            group.add(this._box(0.12, 0.08, 1.1, wood, { x: px, y: 0.045 }));
        }
        if (stack) {
            const [cols, rows, layers] = stack;
            const size = 0.46;
            const colors = [0xc79a62, 0xb98a52, 0xd2a870];
            for (let l = 0; l < layers; l++) {
                for (let c = 0; c < cols; c++) {
                    for (let r = 0; r < rows; r++) {
                        const crate = this._crate(size, size, size, colors[Math.floor(R() * 3)]);
                        crate.position.set(
                            (c - (cols - 1) / 2) * (size + 0.03), PALLET_H + size / 2 + l * size,
                            (r - (rows - 1) / 2) * (size + 0.03));
                        group.add(crate);
                    }
                }
            }
            const wrap = this._mesh(
                new THREE.BoxGeometry(cols * (size + 0.03) + 0.04, layers * size + 0.04, rows * (size + 0.03) + 0.04),
                this._basic(0xdff4ff, { transparent: true, opacity: 0.16, depthWrite: false }),
                { y: PALLET_H + (layers * size) / 2, cast: false, receive: false });
            group.add(wrap);
        }
        this.scene.add(group);
    }

    _buildProps() {
        const { THREE } = this;
        // Barrels
        for (const [x, z, color] of [[5.2, -2.7, 0x2e6da4], [5.75, -2.3, 0xf2c200]]) {
            const g = new THREE.Group();
            g.position.set(x, 0, z);
            g.add(this._mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.8, 24), this._mat(color, { roughness: 0.4 }), { y: 0.4 }));
            for (const y of [0.2, 0.6]) {
                const band = this._mesh(new THREE.TorusGeometry(0.275, 0.018, 8, 24), this._mat(0xffffff), { y, cast: false });
                band.rotation.x = Math.PI / 2;
                g.add(band);
            }
            g.add(this._mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 20), this._mat(0x222a35), { y: 0.81 }));
            this.scene.add(g);
        }
        // Traffic cones by the hazard stripe
        for (const x of [-0.7, 4.7]) {
            const g = new THREE.Group();
            g.position.set(x, 0, -2.2);
            g.add(this._box(0.34, 0.03, 0.34, this._mat(0x222a35), { y: 0.015 }));
            g.add(this._mesh(new THREE.ConeGeometry(0.14, 0.42, 20), this._mat(0xff6a1a, { roughness: 0.5 }), { y: 0.24 }));
            g.add(this._mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.07, 20), this._mat(0xffffff), { y: 0.25, cast: false }));
            this.scene.add(g);
        }
        // Plant
        const plant = new THREE.Group();
        plant.position.set(-4.7, 0, -3.1);
        plant.add(this._mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.35, 16), this._mat(0xc4593b), { y: 0.175 }));
        const leaf = this._mat(0x3f9b5f, { roughness: 0.6 });
        for (let i = 0; i < 7; i++) {
            const l = this._mesh(new THREE.SphereGeometry(0.16, 10, 8), leaf, { y: 0.62 });
            l.scale.set(0.45, 1.5, 0.12);
            l.rotation.z = Math.cos((i / 7) * Math.PI * 2) * 0.55;
            l.rotation.y = (i / 7) * Math.PI * 2;
            l.position.x = Math.cos((i / 7) * Math.PI * 2) * 0.1;
            l.position.z = Math.sin((i / 7) * Math.PI * 2) * 0.1;
            plant.add(l);
        }
        this.scene.add(plant);
        // Hand trolley with a couple of boxes
        const cart = new THREE.Group();
        cart.position.set(0.9, 0, 3.0);
        cart.rotation.y = 0.4;
        const metal = this._mat(0x5d6d7e, { metalness: 0.5, roughness: 0.4 });
        cart.add(this._box(1.0, 0.05, 0.6, metal, { y: 0.22 }));
        for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) {
            const wheel = this._mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 16), this._mat(0x222a35), { x, y: 0.09, z });
            wheel.rotation.z = Math.PI / 2;
            cart.add(wheel);
        }
        cart.add(this._box(0.04, 0.8, 0.5, metal, { x: -0.5, y: 0.6 }));
        const c1 = this._crate(0.42, 0.34, 0.42, 0xd2a870);
        c1.position.set(0.1, 0.42, 0);
        const c2 = this._crate(0.3, 0.26, 0.3, 0x3f78b5);
        c2.position.set(0.12, 0.72, 0);
        cart.add(c1, c2);
        this.scene.add(cart);
    }

    _buildDesk() {
        const { THREE } = this;
        const group = new THREE.Group();
        group.position.set(DESK.x, 0, DESK.z);
        const wood = this._mat(0xa9774a, { roughness: 0.7 });
        const dark = this._mat(0x2b303b, { roughness: 0.4 });
        group.add(this._box(1.7, 0.06, 0.8, wood, { y: 0.78 }));
        for (const [x, z] of [[-0.78, -0.33], [0.78, -0.33], [-0.78, 0.33], [0.78, 0.33]]) {
            group.add(this._box(0.06, 0.75, 0.06, dark, { x, y: 0.375, z }));
        }
        group.add(this._box(0.5, 0.55, 0.7, this._mat(0x8d633d), { x: 0.55, y: 0.45 }));
        // monitor
        group.add(this._mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.04, 20), dark, { y: 0.83, z: -0.15 }));
        group.add(this._box(0.05, 0.22, 0.05, dark, { y: 0.93, z: -0.15 }));
        group.add(this._box(1.0, 0.62, 0.05, dark, { y: 1.3, z: -0.15 }));
        this._screen = this._tex(512, 320);
        const screen = this._mesh(
            new THREE.PlaneGeometry(0.92, 0.54), this._basic(0xffffff, { map: this._screen.texture }),
            { y: 1.3, z: -0.122, cast: false, receive: false });
        group.add(screen);
        this.setTerminalStatus({ lines: ["Internal transfers", "Click to start"] });
        // attention / hover glow around the monitor
        const glow = this._mesh(
            new THREE.BoxGeometry(1.12, 0.74, 0.1), this._basic(0x2fe0d2, { transparent: true, opacity: 0, depthWrite: false }),
            { y: 1.3, z: -0.15, cast: false, receive: false });
        glow.visible = false;
        group.add(glow);
        // keyboard, mouse, mug, papers
        group.add(this._box(0.52, 0.025, 0.18, this._mat(0xdfe3ea), { y: 0.82, z: 0.18 }));
        group.add(this._mesh(new THREE.SphereGeometry(0.04, 12, 8), this._mat(0xdfe3ea), { x: 0.42, y: 0.82, z: 0.2 }));
        group.add(this._mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14), this._mat(0xff9f1c), { x: -0.62, y: 0.86, z: 0.15 }));
        group.add(this._box(0.26, 0.02, 0.34, this._mat(0xffffff), { x: -0.55, y: 0.815, z: -0.15 }));
        group.userData.interactiveId = SCENE_OBJECT_IDS.terminal;
        this.terminal = { group, glow };
        this.scene.add(group);
    }

    _buildWallDecor() {
        const { THREE } = this;
        const zWall = -3.55;
        // Order board above the desk
        const frame = this._mat(0x39414f, { metalness: 0.4 });
        this.scene.add(this._box(2.1, 1.2, 0.05, frame, { x: DESK.x, y: 2.55, z: zWall, cast: false }));
        this._board = this._tex(900, 500);
        this.scene.add(this._mesh(
            new THREE.PlaneGeometry(2.0, 1.1), this._basic(0xffffff, { map: this._board.texture }),
            { x: DESK.x, y: 2.55, z: zWall + 0.03, cast: false, receive: false }));
        this.setOrderBoard(false);
        // Company banner
        const banner = this._tex(512, 160, (ctx, w, h) => {
            ctx.fillStyle = "#714b67";
            roundRect(ctx, 0, 0, w, h, 24);
            ctx.fill();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 76px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("Scale-Up! Co.", w / 2, 106);
        });
        this.scene.add(this._mesh(
            new THREE.PlaneGeometry(1.5, 0.47), this._basic(0xffffff, { map: banner.texture }),
            { x: -5.15, y: 2.7, z: zWall + 0.02, cast: false, receive: false }));
        // Safety poster
        const poster = this._tex(256, 340, (ctx, w, h) => {
            ctx.fillStyle = "#f2c200";
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#222";
            ctx.fillRect(0, 0, w, 56);
            ctx.fillStyle = "#f2c200";
            ctx.font = "bold 38px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("SAFETY", w / 2, 40);
            ctx.fillStyle = "#222";
            ctx.beginPath();
            ctx.moveTo(w / 2, 90);
            ctx.lineTo(w / 2 + 70, 210);
            ctx.lineTo(w / 2 - 70, 210);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = "#f2c200";
            ctx.font = "bold 90px sans-serif";
            ctx.fillText("!", w / 2, 195);
            ctx.fillStyle = "#222";
            ctx.font = "bold 28px sans-serif";
            ctx.fillText("Keep aisles", w / 2, 262);
            ctx.fillText("clear", w / 2, 296);
        });
        this.scene.add(this._mesh(
            new THREE.PlaneGeometry(0.8, 1.06), this._basic(0xffffff, { map: poster.texture }),
            { x: 5.2, y: 2.4, z: zWall + 0.02, cast: false, receive: false }));
        // Wall clock
        this._clockFace = this._tex(128, 128);
        this.scene.add(this._mesh(
            new THREE.CircleGeometry(0.3, 32), this._basic(0xffffff, { map: this._clockFace.texture }),
            { x: -0.9, y: 2.95, z: zWall + 0.02, cast: false, receive: false }));
        this._drawClock();
    }

    _drawClock() {
        const { ctx, texture } = this._clockFace;
        ctx.clearRect(0, 0, 128, 128);
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(64, 64, 62, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#39414f";
        ctx.lineWidth = 8;
        ctx.stroke();
        const now = new Date();
        const hand = (angle, len, width) => {
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(64, 64);
            ctx.lineTo(64 + Math.sin(angle) * len, 64 - Math.cos(angle) * len);
            ctx.stroke();
        };
        hand(((now.getHours() % 12) + now.getMinutes() / 60) * (Math.PI / 6), 30, 6);
        hand(now.getMinutes() * (Math.PI / 30), 46, 4);
        texture.needsUpdate = true;
    }

    _buildBox() {
        const group = this._makeProductBox();
        group.position.copy(this.layout.boxSource);
        this.box = { group };
        this.scene.add(group);
        // floating tag above the source pallet: product name + quantity accounted in the source location
        this._boxTag = this._tex(400, 130);
        const tagMat = new this.THREE.SpriteMaterial({ map: this._boxTag.texture, transparent: true, depthTest: false });
        this._materials.push(tagMat);
        const tag = new this.THREE.Sprite(tagMat);
        tag.scale.set(1.9, 0.62, 1);
        tag.position.set(this.layout.boxSource.x, 1.6, this.layout.boxSource.z);
        tag.renderOrder = 10;
        this.scene.add(tag);
        this._drawBoxTag();
    }

    _buildWorker() {
        const { THREE } = this;
        const group = new THREE.Group();
        const pivot = new THREE.Group(); // hovers, leans, turns; scaled => tiny bot
        pivot.scale.setScalar(0.75);
        pivot.position.y = 0.08;
        group.add(pivot);

        const glossy = (color) => this._mat(color, { roughness: 0.3, metalness: 0.15 });
        const shell = glossy(0xf4f1f6);
        const purple = glossy(0x714b67);
        const orange = glossy(0xff9f1c);
        const teal = glossy(0x017e84);
        const visorMat = this._mat(0x1b2230, { roughness: 0.15, metalness: 0.6 });
        const eyeMat = this._basic(0x5ff5e8);
        const glowMat = this._basic(0x30e0d0);
        const highlightMats = [shell, purple, orange, teal];

        const add = (geo, mat, x, y, z, parent = pivot) => {
            const m = this._mesh(geo, mat, { x, y, z });
            parent.add(m);
            return m;
        };

        add(new THREE.SphereGeometry(0.36, 24, 16), purple, 0, 0.3, 0).scale.set(1, 0.5, 1);
        const ring = add(new THREE.TorusGeometry(0.3, 0.022, 8, 40), glowMat, 0, 0.14, 0);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = false;
        add(new THREE.CapsuleGeometry(0.26, 0.22, 8, 20), shell, 0, 0.68, 0);
        add(new THREE.TorusGeometry(0.265, 0.035, 10, 36), orange, 0, 0.6, 0).rotation.x = Math.PI / 2;
        add(new THREE.SphereGeometry(0.07, 16, 12), teal, 0, 0.8, 0.25).scale.set(1, 1, 0.4);
        add(new THREE.SphereGeometry(0.3, 28, 20), shell, 0, 1.2, 0).scale.set(1.15, 0.9, 1);
        add(new THREE.SphereGeometry(0.27, 24, 16), visorMat, 0, 1.2, 0.19).scale.set(1, 0.68, 0.55);
        const eyes = new THREE.Group();
        eyes.position.set(0, 1.21, 0.335);
        for (const x of [-0.1, 0.1]) {
            const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), eyeMat);
            eye.position.x = x;
            eye.scale.set(0.7, 1.1, 0.35);
            eyes.add(eye);
        }
        pivot.add(eyes);
        for (const x of [-0.38, 0.38]) {
            add(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 16), purple, x, 1.2, 0).rotation.z = Math.PI / 2;
        }
        const antenna = new THREE.Group();
        antenna.position.set(0, 1.44, 0);
        pivot.add(antenna);
        add(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), purple, 0, 0.1, 0, antenna);
        add(new THREE.SphereGeometry(0.05, 14, 10), orange, 0, 0.22, 0, antenna);

        const makeArm = (x) => {
            const arm = new THREE.Group();
            arm.position.set(x, 0.85, 0);
            add(new THREE.CapsuleGeometry(0.065, 0.18, 6, 12), shell, 0, -0.16, 0, arm);
            add(new THREE.SphereGeometry(0.085, 14, 10), purple, 0, -0.34, 0, arm);
            pivot.add(arm);
            return arm;
        };
        const armL = makeArm(-0.4);
        const armR = makeArm(0.4);
        // scanner beam on the right hand (visible only while scanning)
        const beam = new THREE.Mesh(
            new THREE.ConeGeometry(0.16, 0.7, 20, 1, true),
            this._basic(0x30e0d0, { transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = -0.34 - 0.35;
        beam.visible = false;
        armR.add(beam);

        const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), this._basic(0x000000, { transparent: true, opacity: 0.22 }));
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = 0.01;
        group.add(shadow);

        group.userData.interactiveId = SCENE_OBJECT_IDS.worker;
        group.position.copy(this.layout.workerIdle);
        this.worker = { group, pivot, armL, armR, antenna, eyes, shadow, beam, state: "idle", phase: 0, hop: 0, highlightMats };
        this.scene.add(group);
    }

    _buildStockLabel() {
        const { THREE } = this;
        this._label = this._tex(420, 150);
        const material = new THREE.SpriteMaterial({ map: this._label.texture, transparent: true, depthTest: false });
        this._materials.push(material);
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.3, 0.82, 1);
        sprite.position.set(2.0, 3.2, SHELF_Z + 0.2);
        sprite.renderOrder = 10;
        this.scene.add(sprite);
        this._drawLabel(0);
    }

    _drawLabel(quantity) {
        const { ctx, canvas, texture } = this._label;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = quantity >= 1 ? "#017e84" : "#714b67";
        roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 24);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = "bold 36px sans-serif";
        ctx.fillText(this._names.shelf, canvas.width / 2, 58);
        const q = Number.isInteger(quantity) ? quantity : Math.round(quantity * 100) / 100;
        const text = `${this._names.product}: ${q}`;
        fitFont(ctx, text, canvas.width - 40, 30, "normal");
        ctx.fillText(text, canvas.width / 2, 106);
        texture.needsUpdate = true;
    }

    _buildDust() {
        const { THREE } = this;
        const n = 90;
        const pos = new Float32Array(n * 3);
        const R = rng(99);
        for (let i = 0; i < n; i++) {
            pos[i * 3] = -5.5 + R() * 4.5;
            pos[i * 3 + 1] = 0.4 + R() * 3.2;
            pos[i * 3 + 2] = -2.5 + R() * 5.5;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0xfff6d8, size: 0.05, transparent: true, opacity: 0.6, depthWrite: false });
        this._materials.push(mat);
        this.dust = new THREE.Points(geo, mat);
        this.scene.add(this.dust);
    }

    // ------------------------------------------------------------------
    // Render loop
    // ------------------------------------------------------------------
    _animateWorker(dt, t) {
        const w = this.worker;
        const s = w.state;
        let armL = 0, armR = 0, lean = 0, yaw = 0, hover = 0.08 + Math.sin(t * 2) * 0.035;
        if (s === "walk" || s === "carry") {
            w.phase += dt * 9;
            const sw = Math.sin(w.phase);
            lean = 0.12;
            hover = 0.1 + Math.sin(w.phase * 2) * 0.025;
            if (s === "walk") {
                armL = -sw * 0.45;
                armR = sw * 0.45;
            } else {
                armL = armR = -1.25;
            }
        } else if (s === "reach") {
            armL = armR = -1.3;
            hover = 0.08 + Math.sin(t * 2) * 0.02;
        } else if (s === "scan") {
            armR = -1.5;
            armL = 0.1;
            yaw = Math.sin(t * 2.2) * 0.5;
            lean = 0.05;
        } else if (s === "inspect") {
            lean = 0.28 + Math.sin(t * 5) * 0.04;
            armL = -0.4;
            armR = -0.7 + Math.sin(t * 6) * 0.2;
        } else if (s === "wave") {
            armR = -2.7 + Math.sin(t * 11) * 0.4;
            armL = 0.05;
        } else if (s === "celebrate") {
            armL = armR = -2.8 + Math.sin(t * 14) * 0.2;
            hover = 0.18;
        } else {
            const sw = Math.sin(t * 1.6) * 0.05;
            armL = sw;
            armR = -sw;
        }
        const f = Math.min(1, dt * 12);
        w.armL.rotation.x += (armL - w.armL.rotation.x) * f;
        w.armR.rotation.x += (armR - w.armR.rotation.x) * f;
        w.pivot.rotation.x += (lean - w.pivot.rotation.x) * f;
        w.pivot.rotation.y += (yaw - w.pivot.rotation.y) * f;
        const y = hover + w.hop;
        w.pivot.position.y = y;
        w.shadow.scale.setScalar(Math.max(0.5, 1 - (y - 0.08) * 1.5));
        w.antenna.rotation.z = Math.sin(t * 3) * 0.12 + (s === "walk" || s === "carry" ? Math.sin(w.phase) * 0.2 : 0);
        w.eyes.scale.y = t % 3.6 < 0.12 ? 0.1 : 1; // blink
        w.beam.visible = s === "scan";
    }

    _animateWorld(dt, t) {
        // terminal glow: pulses for attention, steady on hover
        const hover = this._hoverId === SCENE_OBJECT_IDS.terminal;
        const glow = this.terminal.glow;
        const opacity = hover ? 0.4 : this._pulse ? 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 4)) : 0;
        glow.material.opacity = opacity;
        glow.visible = opacity > 0;
        // dust motes drift in the window light
        const p = this.dust.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) {
            p.array[i * 3 + 1] += dt * 0.06;
            p.array[i * 3] += Math.sin(t * 0.5 + i) * dt * 0.05;
            if (p.array[i * 3 + 1] > 3.6) {
                p.array[i * 3 + 1] = 0.4;
            }
        }
        p.needsUpdate = true;
        // confetti
        for (let i = this._confetti.length - 1; i >= 0; i--) {
            const c = this._confetti[i];
            c.life -= dt;
            c.mesh.position.y = Math.max(0.02, c.mesh.position.y + c.vy * dt);
            c.mesh.position.x += Math.sin(t * 3 + c.phase) * dt * 0.4;
            if (c.mesh.position.y > 0.02) {
                c.mesh.rotation.x += c.spin * dt;
                c.mesh.rotation.z += c.spin * dt * 0.7;
            }
            if (c.life <= 0) {
                this.scene.remove(c.mesh);
                this._confetti.splice(i, 1);
            }
        }
        // wall clock
        this._clockT = (this._clockT || 0) + dt;
        if (this._clockT > 30) {
            this._clockT = 0;
            this._drawClock();
        }
    }

    _loop() {
        if (this.disposed) {
            return;
        }
        this._raf = requestAnimationFrame(this._loop);
        const dt = Math.min(this._clock.getDelta(), 0.05);
        const t = this._clock.elapsedTime;
        this.animator.update(dt);
        this._animateWorker(dt, t);
        this._animateWorld(dt, t);
        this.renderer.render(this.scene, this.camera);
        this.onFrame?.();
    }
}
