import { OfficeScene } from "@scale_up_game/three/scenes/office_scene";
import { makeBot } from "@scale_up_game/three/kit/characters";
import { FRAME_COLOR, makeVisitorChair } from "@scale_up_game/three/kit/props";
import { plasterTexture, rugTexture, seeded, tileTexture } from "@scale_up_game/three/kit/textures";

// Recessed ceiling light panels (x, z), over the desk and the room.
const CEILING_PANELS = [[-1.6, -0.6], [1.6, -0.6], [-1.6, -3.4], [1.6, -3.4]];

/**
 * Admin's point of view: the camera is the player sitting at the desk.
 * OdooBot enters through the doorway to brief the player, who stays off camera.
 */
export class OfficePovScene extends OfficeScene {
    constructor(THREE, container, opts = {}) {
        super(THREE, container, opts);
        this.ceo.group.visible = false;

        this._botStart = [0, 0, -5.48];
        // The bot steps aside after entering, leaving the monitor's sightline
        // open while still facing the player from behind the desk.
        this._botSpot = [-1.45, 0, -3.2];
        this._botHasEntered = false;
        this.bot = makeBot(this);
        this.bot.group.position.set(...this._botStart);
        // Turn slightly toward the seated player, who is to the bot's right.
        this.bot.group.rotation.y = 0.45;
        this.bot.group.visible = true;
        this.scene.add(this.bot.group);
        this.actors.push(this.bot);
        this.people.bot = this.bot;

        // Seated, fixed viewpoint: desk in the foreground, then open office
        // floor, then the glass door at the far end of the room.
        this.cameraTarget = [0.2, 1.35, -2.75];
        this.cameraOffset = [0.0, 0.1, 3.4];
        this._updateCamera();

        // This perspective is deliberately fixed: wheel input must neither
        // zoom the scene nor scroll the surrounding page.
        this.renderer.domElement.removeEventListener("wheel", this._onWheel);
        this._lockWheel = (ev) => ev.preventDefault();
        this.renderer.domElement.addEventListener("wheel", this._lockWheel, { passive: false });
    }

    setCast() {
        // Only OdooBot is in the room: no other character models.
        for (const [key, rig] of Object.entries(this.people)) {
            if (key !== "bot") {
                rig.group.visible = false;
            }
        }
        this.bot.group.visible = true;
    }

    setSpeaker(key) {
        this.bot.state = key === "bot" ? "talk" : "idle";
        if (key === "bot" && !this._botHasEntered) {
            this._botHasEntered = true;
            this.animator.tween(1.35, (progress) => {
                const ease = 1 - Math.pow(1 - progress, 3);
                this.bot.group.position.set(
                    this._botStart[0] + (this._botSpot[0] - this._botStart[0]) * ease,
                    this._botStart[1],
                    this._botStart[2] + (this._botSpot[2] - this._botStart[2]) * ease,
                );
            });
        }
    }

    dispose() {
        this.renderer.domElement.removeEventListener("wheel", this._lockWheel);
        super.dispose();
    }

    /**
     * Indoor lighting: the room has a ceiling, so no sun. Soft ambient light,
     * one overhead light for the shadows, warm pools under the ceiling panels
     * and cool daylight coming in by the window.
     */
    _buildLights() {
        const { THREE } = this;
        this.scene.add(new THREE.HemisphereLight(0xfffdf9, 0xd9cfc2, 0.735));
        const overhead = new THREE.DirectionalLight(0xfff6ea, 0.42);
        overhead.position.set(0.6, 9, -1.2);
        overhead.target.position.set(0, 0, -2.2);
        overhead.castShadow = true;
        overhead.shadow.mapSize.set(2048, 2048);
        Object.assign(overhead.shadow.camera, { left: -6, right: 6, top: 7, bottom: -7, near: 1, far: 14 });
        this.scene.add(overhead, overhead.target);
        for (const [x, z] of CEILING_PANELS) {
            const lamp = new THREE.PointLight(0xfee9ca, 0.19, 6, 1);
            lamp.position.set(x, 3.0, z);
            this.scene.add(lamp);
        }
        // Light bouncing off the room behind the player: keeps the walls facing
        // the camera bright (the overhead light barely reaches them).
        const bounce = new THREE.DirectionalLight(0xfffaf3, 0.19);
        bounce.position.set(0.5, 2.2, 6);
        bounce.target.position.set(0, 1.4, -6);
        this.scene.add(bounce, bounce.target);
        const daylight = new THREE.PointLight(0xcfe6ff, 0.47, 4, 1);
        daylight.position.set(-2.35, 1.9, -5.2); // just inside the window
        this.scene.add(daylight);
    }

    _buildStage() {
        const { THREE } = this;
        // Ceiling with recessed light panels, and the right wall closing the room.
        const ceiling = this.mesh(new THREE.PlaneGeometry(9, 11), this.mat(0xf4f5f7, { roughness: 1 }), { y: 3.3, z: -1.55, cast: false });
        ceiling.rotation.x = Math.PI / 2;
        this.scene.add(ceiling);
        const panelMat = this.basic(0xfff8ec);
        const rimMat = this.mat(0xd5d8de);
        for (const [x, z] of CEILING_PANELS) {
            this.scene.add(this.box(1.3, 0.03, 0.7, rimMat, { x, y: 3.29, z, cast: false }));
            this.scene.add(this.box(1.2, 0.03, 0.6, panelMat, { x, y: 3.28, z, cast: false, receive: false }));
        }
        // Floor: large stone tiles (1.1 m) under a woven rug.
        const floor = this.mesh(new THREE.PlaneGeometry(9, 11), this.mat(0xffffff, {
            map: tileTexture(this, { tiles: 2, colors: ["#ccbeaa", "#c5b6a1", "#d2c5b2", "#c8baa6"], grout: "#a79981", rx: 9 / 2.2, ry: 11 / 2.2 }), roughness: 0.7, metalness: 0,
        }), { y: 0, z: -1.55, cast: false });
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        const rug = this.mesh(new THREE.PlaneGeometry(3.6, 4.5), this.mat(0xffffff, { map: rugTexture(this), roughness: 1 }),
            { x: 0.05, y: 0.006, z: -3.1, cast: false });
        rug.rotation.x = -Math.PI / 2;
        this.scene.add(rug);

        // Cream plaster walls (5% cooler than pure cream) with a panelled wainscot, a chair rail, skirting
        // and a crown moulding: a real room, not a white box.
        const wall = this.mat(0xffffff, { map: plasterTexture(this, { base: "#f1e8dc", rx: 3, ry: 1 }), roughness: 0.95 });
        this.scene.add(this.box(9, 3.3, 0.18, wall, { y: 1.65, z: -5.95 }));
        this.scene.add(this.box(0.18, 3.3, 11, wall, { x: -4.4, y: 1.65, z: -1.55 }));
        this.scene.add(this.box(0.18, 3.3, 11, wall, { x: 4.4, y: 1.65, z: -1.55 }));
        const trim = this.mat(0xf7f1e8, { roughness: 0.5 });
        const H = 0.95; // wainscot height
        const panels = (length) => this.mat(0xffffff, { map: this._panelTexture(length), roughness: 0.6 });
        // far wall: left and right of the door
        for (const [x0, x1] of [[-4.31, -0.9], [0.9, 4.31]]) {
            const len = x1 - x0, x = (x0 + x1) / 2;
            this.scene.add(this.box(len, H, 0.03, panels(len), { x, y: H / 2, z: -5.845 }));
            this.scene.add(this.box(len, 0.05, 0.05, trim, { x, y: H, z: -5.835 }));
        }
        this.scene.add(this.box(8.62, 0.12, 0.05, trim, { y: 0.06, z: -5.835 }));
        this.scene.add(this.box(8.62, 0.1, 0.08, trim, { y: 3.25, z: -5.82, cast: false }));
        for (const side of [-1, 1]) {
            const x = side * 4.295;
            const panel = this.box(11, H, 0.03, panels(11), { x, y: H / 2, z: -1.55 });
            panel.rotation.y = Math.PI / 2;
            this.scene.add(panel);
            this.scene.add(this.box(0.05, 0.05, 11, trim, { x: side * 4.285, y: H, z: -1.55 }));
            this.scene.add(this.box(0.05, 0.12, 11, trim, { x: side * 4.285, y: 0.06, z: -1.55 }));
            this.scene.add(this.box(0.08, 0.1, 11, trim, { x: side * 4.27, y: 3.25, z: -1.55, cast: false }));
        }
    }

    /** Wainscot texture: framed panels about 0.9 m wide, painted a deeper cream. */
    _panelTexture(length) {
        const count = Math.max(1, Math.round(length / 0.9));
        const { texture } = this.tex(128 * count, 128, (ctx, w, h) => {
            ctx.fillStyle = "#e5d8c4";
            ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < count; i++) {
                const x = i * 128 + 14, y = 16, pw = 100, ph = h - 32;
                ctx.fillStyle = "rgba(255, 250, 240, 0.55)"; // lit bevel
                ctx.fillRect(x, y, pw, 3);
                ctx.fillRect(x, y, 3, ph);
                ctx.fillStyle = "rgba(120, 95, 65, 0.3)"; // shadowed bevel
                ctx.fillRect(x, y + ph - 3, pw, 3);
                ctx.fillRect(x + pw - 3, y, 3, ph);
            }
        });
        return texture;
    }

    /** Life on the walls and the cabinet: a ticking clock, books, a vase. */
    _buildDecor() {
        const { THREE } = this;
        // Wall clock above the door, showing the real time.
        const clock = new THREE.Group();
        clock.position.set(0, 2.88, -5.84);
        const rim = this.mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 40), this.mat(0x3a2f28, { roughness: 0.5 }));
        rim.rotation.x = Math.PI / 2;
        clock.add(rim);
        const dial = this.tex(256, 256, (ctx, w) => {
            ctx.fillStyle = "#f8f3ea";
            ctx.beginPath();
            ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#3a2f28";
            for (let i = 0; i < 12; i++) { // hour marks, longer every quarter
                const len = i % 3 ? 14 : 24, tw = i % 3 ? 4 : 8;
                ctx.save();
                ctx.translate(w / 2, w / 2);
                ctx.rotate((i / 12) * Math.PI * 2);
                ctx.fillRect(-tw / 2, -112, tw, len);
                ctx.restore();
            }
        });
        clock.add(this.mesh(new THREE.CircleGeometry(0.21, 40), this.mat(0xffffff, { map: dial.texture, roughness: 0.6 }), { z: 0.027, cast: false }));
        const hand = (len, width, z) => {
            const pivot = new THREE.Group();
            pivot.position.z = z;
            pivot.add(this.box(width, len, 0.005, this.mat(0x2a221d), { y: len / 2 - 0.02, cast: false }));
            clock.add(pivot);
            return pivot;
        };
        this._clockHands = { h: hand(0.11, 0.014, 0.03), m: hand(0.16, 0.009, 0.035), s: hand(0.17, 0.004, 0.04) };
        this.scene.add(clock);

        // Books and a vase on the cabinet.
        const rnd = seeded(21);
        const covers = [0x7d3c34, 0x2f4f6f, 0x5f6b3a, 0xb08a4a, 0x4a3a5c, 0x8a5a3c];
        let x = -3.95;
        for (let i = 0; i < 7; i++) {
            const bw = 0.035 + rnd() * 0.025, bh = 0.2 + rnd() * 0.08;
            const book = this.box(bw, bh, 0.17, this.mat(covers[i % covers.length], { roughness: 0.8 }), { x: x + bw / 2, y: 1.0 + bh / 2, z: -5.45 });
            book.rotation.z = i === 6 ? 0.25 : 0;
            this.scene.add(book);
            x += bw + 0.004;
        }
        const vase = this.mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.22, 20), this.mat(0x5f7f8c, { roughness: 0.3 }), { x: -3.4, y: 1.11, z: -5.42 });
        this.scene.add(vase);
        const stemMat = this.mat(0x5b6b3a);
        const bloomMat = this.mat(0xe8d6b0, { roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
            const a = i * 1.3, tilt = 0.15 + (i % 2) * 0.12;
            const stem = this.mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 5), stemMat, { x: -3.4 + Math.sin(a) * 0.03, y: 1.36, z: -5.42 + Math.cos(a) * 0.03 });
            stem.rotation.set(Math.cos(a) * tilt, 0, -Math.sin(a) * tilt);
            this.scene.add(stem);
            this.scene.add(this.mesh(new THREE.SphereGeometry(0.03, 10, 8), bloomMat,
                { x: -3.4 + Math.sin(a) * (0.03 + tilt * 0.16), y: 1.51, z: -5.42 + Math.cos(a) * (0.03 + tilt * 0.16) }));
        }
    }

    _frame(dt, t) {
        super._frame(dt, t);
        if (this._clockHands) {
            const now = new Date();
            const sec = now.getSeconds() + now.getMilliseconds() / 1000;
            const min = now.getMinutes() + sec / 60;
            const hrs = (now.getHours() % 12) + min / 60;
            this._clockHands.s.rotation.z = -(sec / 60) * Math.PI * 2;
            this._clockHands.m.rotation.z = -(min / 60) * Math.PI * 2;
            this._clockHands.h.rotation.z = -(hrs / 12) * Math.PI * 2;
        }
    }

    _buildFurniture() {
        super._buildFurniture();
        const { THREE } = this;
        // Move the background furniture to the far wall, preserving a broad,
        // uncluttered walk from the desk to the centered entrance.
        this.board.group.position.set(2.65, 1.8, -5.83);
        this.window.position.set(-2.35, 1.8, -5.83);
        this.cabinet.position.set(-3.65, 0, -5.4);
        this.plant.position.set(3.8, 0, -5.4);
        this.papers.visible = false;
        // Two visitor chairs side by side across the desk, facing the player.
        this.chair.visible = false;
        // Desk spans x -0.75..0.95 (back edge z -2.3); chairs are ~0.6 m wide at
        // this scale: pulled up to the desk, spread to its ends without passing them.
        for (const [x, rot] of [[-0.4, 0.06], [0.6, -0.06]]) {
            const chair = makeVisitorChair(this);
            chair.position.set(x, 0, -2.65);
            chair.rotation.y = rot;
            chair.scale.setScalar(1.15);
            this.scene.add(chair);
        }
        this._buildDecor();

        // Centered glass door at the far wall: the bot visibly enters through it.
        const frame = this.mat(FRAME_COLOR, { roughness: 0.5, metalness: 0.3 });
        const glass = this.mat(0x9fd8e9, { transparent: true, opacity: 0.42, roughness: 0.12, metalness: 0.2 });
        this.scene.add(this.box(1.5, 2.3, 0.05, glass, { y: 1.15, z: -5.84 }));
        for (const x of [-0.82, 0.82]) {
            this.scene.add(this.box(0.12, 2.5, 0.12, frame, { x, y: 1.25, z: -5.8 }));
        }
        this.scene.add(this.box(1.76, 0.12, 0.12, frame, { y: 2.44, z: -5.8 }));
        this.scene.add(this.box(0.08, 2.3, 0.08, frame, { y: 1.15, z: -5.78 }));
        this.scene.add(this.mesh(new THREE.SphereGeometry(0.045, 12, 10), this.mat(0xe3b341), { x: 0.62, y: 1.12, z: -5.75 }));
    }
}
