import { SCENE_OBJECT_IDS } from "@scale_up_game/three/scene";
import { BaseScene } from "@scale_up_game/three/kit/base_scene";
import { makeNameTag, makePerson } from "@scale_up_game/three/kit/characters";
import { makeBoard, makeCabinet, makeChair, makeDesk, makePapers, makePlant, makeWindow } from "@scale_up_game/three/kit/props";

/**
 * Office corner: the player (CEO) and the colleague of the sub-level talk next
 * to the desk, and the desk computer is where the real Odoo documents are made.
 * Deliberately small: a stage, not an empty warehouse.
 */
const CEO_SPOT = [-0.85, 0, 0.15];
const CEO_FACING = Math.PI / 2; // towards +x, i.e. towards the colleague
const NPC_SPOTS = [[0.95, 0, 0.15], [0.25, 0, 1.15]];
const NPC_FACING = [-Math.PI / 2, Math.PI * 0.9];

const STAGE_TEXT = { none: "Ready", draft: "In progress", ready: "Almost there", done: "Done ✔" };

export class OfficeScene extends BaseScene {
    constructor(THREE, container, opts = {}) {
        super(THREE, container, { ...opts, cameraTarget: [0.05, 1.15, -0.35], cameraOffset: [4.1, 3.3, 5.4] });
        this.people = {};
        this._camShift = 0;
        this._camShiftTarget = 0;
        this._buildStage();
        this._buildFurniture();
        this.ceo = this._addPerson("ceo", CEO_SPOT, CEO_FACING);
        this.interactives = [this.desk.group];
        this.start();
    }

    // ---- public API --------------------------------------------------------
    /** Make sure the characters of this sub-level exist (and only those). */
    setCast(cast = []) {
        const keys = cast.filter((key) => key !== "ceo");
        for (const [key, rig] of Object.entries(this.people)) {
            if (key !== "ceo" && !keys.includes(key)) {
                rig.group.visible = false;
            }
        }
        keys.slice(0, NPC_SPOTS.length).forEach((key, i) => {
            const rig = this.people[key] || this._addPerson(key, NPC_SPOTS[i], NPC_FACING[i]);
            rig.group.position.set(...NPC_SPOTS[i]);
            rig.group.rotation.y = NPC_FACING[i];
            rig.group.visible = true;
        });
    }

    /** Who is speaking right now (null = nobody): drives the talk/listen poses. */
    setSpeaker(key) {
        for (const [name, rig] of Object.entries(this.people)) {
            if (!rig.group.visible) {
                continue;
            }
            rig.state = key ? (name === key ? "talk" : "listen") : "idle";
        }
        const speaker = this.people[key];
        this._camShiftTarget = speaker ? (speaker.group.position.x - 0.1) * 0.25 : 0;
    }

    startWorking() {
        this.setSpeaker(null);
    }

    applyState(game) {
        this.setCast((game.cast || []).map((c) => c.key));
        this._drawScreen(game);
        this._drawBoard(game);
        this.papers.visible = (game.scene || {}).papers === true;
    }

    async celebrate() {
        this.setSpeaker(null);
        for (const rig of Object.values(this.people)) {
            if (rig.group.visible) {
                rig.state = "celebrate";
            }
        }
        this.burstConfetti([0.2, 3.2, -0.6], [5, 4]);
        await this.animator.tween(2.2, () => {});
        for (const rig of Object.values(this.people)) {
            rig.state = "idle";
        }
    }

    // ---- build --------------------------------------------------------------
    _buildStage() {
        const { THREE } = this;
        const floor = this.mesh(new THREE.PlaneGeometry(9, 7), this.mat(0xd9dde3, { roughness: 0.95 }), { y: 0, z: 0.4, cast: false });
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        const rug = this.mesh(new THREE.PlaneGeometry(4.4, 3.2), this.mat(0xc3bacd, { roughness: 1 }), { x: 0.05, y: 0.012, z: 0.25, cast: false });
        rug.rotation.x = -Math.PI / 2;
        this.scene.add(rug);
        const wall = this.mat(0xeceef2, { roughness: 0.95 });
        this.scene.add(this.box(9, 3.3, 0.18, wall, { y: 1.65, z: -2.7 }));
        this.scene.add(this.box(0.18, 3.3, 7, wall, { x: -4.4, y: 1.65, z: 0.3 }));
        // skirting board, so the wall does not float
        this.scene.add(this.box(9, 0.12, 0.22, this.mat(0xd3d7dd), { y: 0.06, z: -2.68 }));
    }

    _buildFurniture() {
        this.desk = makeDesk(this);
        this.desk.group.position.set(0.1, 0, -1.9);
        this.desk.group.userData.interactiveId = SCENE_OBJECT_IDS.terminal;
        this.scene.add(this.desk.group);
        this.anchors = { terminal: new this.THREE.Vector3(0.1, 1.8, -1.9) };

        const chair = makeChair(this);
        chair.position.set(0.1, 0, -2.45);
        chair.rotation.y = Math.PI;
        this.scene.add(chair);

        this.papers = makePapers(this);
        this.papers.position.set(0.72, 0.82, -1.75);
        this.papers.visible = false;
        this.scene.add(this.papers);

        // Progress board on the clear part of the wall (nothing stands in front of it).
        this.board = makeBoard(this, 2.0, 1.2);
        this.board.group.position.set(2.5, 1.8, -2.58);
        this.scene.add(this.board.group);

        const win = makeWindow(this, { w: 1.7, h: 1.15 });
        win.position.set(-2.2, 1.8, -2.58);
        this.scene.add(win);

        const cabinet = makeCabinet(this);
        cabinet.position.set(-3.5, 0, -2.3);
        this.scene.add(cabinet);

        const plant = makePlant(this);
        plant.position.set(3.9, 0, -2.1);
        this.scene.add(plant);
    }

    _addPerson(key, spot, rotY) {
        const rig = makePerson(this, key);
        rig.group.position.set(...spot);
        rig.group.rotation.y = rotY;
        rig.group.add(makeNameTag(this, rig.look.name));
        this.scene.add(rig.group);
        this.actors.push(rig);
        this.people[key] = rig;
        return rig;
    }

    // ---- drawing -------------------------------------------------------------
    _drawScreen(game) {
        const { ctx, canvas, texture } = this.desk.screen;
        const w = canvas.width;
        ctx.fillStyle = "#1c2430";
        ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = game.stage === "done" ? "#017e84" : "#714b67";
        ctx.fillRect(0, 0, w, 64);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(game.level_name, 20, 43);
        ctx.font = "bold 28px sans-serif";
        ctx.fillStyle = game.stage === "done" ? "#5ff5e8" : "#ffb347";
        ctx.fillText(STAGE_TEXT[game.stage] || "", 20, 116);
        ctx.font = "24px sans-serif";
        ctx.fillStyle = "#cfd8dc";
        const rows = game.panel || [];
        rows.slice(0, 3).forEach((row, i) => ctx.fillText(`${row.label}: ${row.value}`, 20, 164 + i * 34));
        if (!rows.length) {
            ctx.fillText("Odoo · click to open", 20, 164);
        }
        texture.needsUpdate = true;
    }

    _drawBoard(game) {
        const { ctx, canvas, texture } = this.board.screen;
        const w = canvas.width;
        ctx.fillStyle = "#f6f4f7";
        ctx.fillRect(0, 0, w, canvas.height);
        ctx.fillStyle = "#714b67";
        ctx.fillRect(0, 0, w, 62);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 34px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(game.group_name || "Level", 20, 43);
        ctx.font = "26px sans-serif";
        game.steps.slice(0, 5).forEach((step, i) => {
            ctx.fillStyle = step.done ? "#017e84" : "#8a8f99";
            ctx.fillText(`${step.done ? "✔" : "○"} ${step.label}`.slice(0, 36), 20, 108 + i * 40);
        });
        texture.needsUpdate = true;
    }

    _frame(dt, t) {
        const hover = this._hoverId === SCENE_OBJECT_IDS.terminal;
        const opacity = hover ? 0.45 : this._pulse ? 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(t * 4)) : 0;
        this.desk.glow.material.opacity = opacity;
        this.desk.glow.visible = opacity > 0;
        // the camera leans towards whoever is speaking
        this._camShift += (this._camShiftTarget - this._camShift) * Math.min(1, dt * 2.5);
        if (Math.abs(this._camShiftTarget - this._camShift) > 0.001) {
            this.cameraTarget[0] = 0.05 + this._camShift;
            this._updateCamera();
        }
    }
}
