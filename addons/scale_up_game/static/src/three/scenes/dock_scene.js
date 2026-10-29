import { Aborted, faceTowards, walkTo } from "@scale_up_game/three/animations";
import { SCENE_OBJECT_IDS } from "@scale_up_game/three/scene";
import { BaseScene } from "@scale_up_game/three/kit/base_scene";
import { makeNameTag, makePerson } from "@scale_up_game/three/kit/characters";
import { makeBoard, makeDesk, makeHazardStrip, makePallet, makeRack, makeTruck } from "@scale_up_game/three/kit/props";

/** Warehouse + loading dock: the sub-levels where goods physically move. */
const DOCK_X = 6.4; // parked truck (lane z = DOCK_Z)
const DOCK_Z = 0.4;
const OFF_X = 20; // out of sight
const TRUCK_REAR_X = DOCK_X - 2.4;
const WORKER_SPOT = [2.6, 0, 1.6];
const NPC_SPOTS = [[0.4, 0, 1.9], [-1.0, 0, 1.4]];

const STAGE_TEXT = { none: "Ready", draft: "In progress", ready: "Ready to validate", done: "Done ✔" };

export class DockScene extends BaseScene {
    constructor(THREE, container, opts = {}) {
        super(THREE, container, { ...opts, cameraTarget: [2.0, 0.9, 0.2], cameraOffset: [8.2, 8.0, 10.0] });
        const V = (x, y, z) => new THREE.Vector3(x, y, z);
        this.people = {};
        this._stock = 0;
        this.layout = {
            spots: {
                pallets: { stand: V(1.9, 0, 2.3), look: V(1.9, 0.5, 1.0) },
                truck: { stand: V(TRUCK_REAR_X - 0.6, 0, DOCK_Z), look: V(DOCK_X, 0.8, DOCK_Z) },
                centre: { stand: V(2.6, 0, 1.6) },
            },
        };
        this._buildRoom();
        this._buildProps();
        this.worker = this._addPerson("worker", WORKER_SPOT, Math.PI * 0.75);
        this.interactives = [this.desk.group, this.worker.group];
        this.start();
    }

    // ---- public API ------------------------------------------------------
    setCast(cast = []) {
        const keys = cast.filter((key) => key !== "worker");
        for (const [key, rig] of Object.entries(this.people)) {
            if (key !== "worker" && !keys.includes(key)) {
                rig.group.visible = false;
            }
        }
        keys.slice(0, NPC_SPOTS.length).forEach((key, i) => {
            const rig = this.people[key] || this._addPerson(key, NPC_SPOTS[i], Math.PI * 1.1);
            rig.group.position.set(...NPC_SPOTS[i]);
            rig.group.visible = true;
        });
    }

    setSpeaker(key) {
        for (const [name, rig] of Object.entries(this.people)) {
            if (rig.group.visible) {
                rig.state = key ? (name === key ? "talk" : "listen") : "idle";
            }
        }
    }

    setHover(id) {
        super.setHover(id);
        const on = id === SCENE_OBJECT_IDS.worker;
        for (const m of this.worker.highlightMats) {
            m.emissive.setHex(on ? 0x2a2a00 : 0x000000);
        }
    }

    startWorking() {
        this.setSpeaker(null);
        this.worker.state = "idle";
    }

    applyState(game) {
        const st = game.scene || {};
        this._stock = st.stock || 0;
        this._setStock(this._stock);
        this._setTrucks(st);
        this.setCast((game.cast || []).map((c) => c.key));
        this._drawScreen(game);
        this._drawBoard(game);
    }

    /** The goods really moved in Odoo: show it. */
    async celebrate(game) {
        this._interrupt();
        const ctx = (this._ctx = { aborted: false });
        const st = game.scene || {};
        try {
            if (game.scenario === "bs_receive") {
                await this._shuttle(ctx, { truck: this.trucks.wood, fromTruck: true, trips: 2, total: 10, endStock: st.stock || 0 });
            } else if (game.scenario === "bs_deliver") {
                await this._shuttle(ctx, { truck: this.trucks.azure, fromTruck: false, trips: 1, total: 3, endStock: st.stock || 0 });
            }
            this.burstConfetti([2, 3.5, 0.5]);
            this.worker.state = "celebrate";
            await this.animator.tween(1.8, () => {});
            this.worker.state = "idle";
        } catch (e) {
            if (!(e instanceof Aborted)) {
                throw e;
            }
        }
        if (!this.disposed) {
            this.applyState(game);
        }
    }

    // ---- build -------------------------------------------------------------
    _buildRoom() {
        const { THREE } = this;
        const floor = this.mesh(new THREE.PlaneGeometry(18, 11), this.mat(0xcfd4da, { roughness: 0.9 }), { x: 1.5, cast: false });
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        const wall = this.mat(0xe6e9ee, { roughness: 0.95 });
        this.scene.add(this.box(18, 3.4, 0.2, wall, { x: 1.5, y: 1.7, z: -4.8 }));
        this.scene.add(this.box(0.2, 3.4, 11, wall, { x: -7.6, y: 1.7, z: 0 }));
        const strip = makeHazardStrip(this, 0.35, 2.0);
        strip.position.set(TRUCK_REAR_X - 0.35, 0.015, DOCK_Z);
        this.scene.add(strip);
        const sign = makeBoard(this, 1.5, 0.5);
        sign.group.position.set(6.4, 2.2, -4.65);
        this._drawSign(sign.screen, "DOCK 3");
        this.scene.add(sign.group);
    }

    _buildProps() {
        this.desk = makeDesk(this);
        this.desk.group.position.set(-5.4, 0, -3.3);
        this.desk.group.rotation.y = 0.25;
        this.desk.group.userData.interactiveId = SCENE_OBJECT_IDS.terminal;
        this.scene.add(this.desk.group);
        this.anchors = { terminal: new this.THREE.Vector3(-5.4, 1.8, -3.3) };

        // Racks stand away from the wall that carries the board, so nothing hides it.
        for (const x of [0.6, 3.6]) {
            const rack = makeRack(this, { seed: x + 7 });
            rack.position.set(x, 0, -3.9);
            this.scene.add(rack);
        }
        this.pallets = [makePallet(this), makePallet(this)];
        this.pallets[0].group.position.set(1.2, 0, 1.2);
        this.pallets[1].group.position.set(2.6, 0, 1.2);
        this.pallets.forEach((p) => this.scene.add(p.group));

        this.board = makeBoard(this, 2.2, 1.3);
        this.board.group.position.set(-3.1, 2.0, -4.68);
        this.scene.add(this.board.group);

        this.trucks = {
            wood: makeTruck(this, { color: 0x1f7a4d, label: "Wood Corner" }),
            azure: makeTruck(this, { color: 0x2a5db0, label: "Azure Interior" }),
        };
        for (const truck of Object.values(this.trucks)) {
            truck.group.position.set(OFF_X, 0, DOCK_Z);
            this.scene.add(truck.group);
        }
    }

    _addPerson(key, spot, rotY) {
        const rig = makePerson(this, key);
        rig.group.position.set(...spot);
        rig.group.rotation.y = rotY;
        rig.group.add(makeNameTag(this, rig.look.name));
        rig.group.userData.interactiveId = key === "worker" ? SCENE_OBJECT_IDS.worker : undefined;
        this.scene.add(rig.group);
        this.actors.push(rig);
        this.people[key] = rig;
        return rig;
    }

    // ---- state -> visuals -----------------------------------------------------
    _setStock(n) {
        const [a, b] = this.pallets;
        a.setCount(Math.min(n, a.capacity));
        b.setCount(Math.max(0, Math.min(n - a.capacity, b.capacity)));
    }

    _setTrucks(st) {
        const { wood, azure } = this.trucks;
        const park = (truck, cargo) => {
            truck.group.position.x = DOCK_X;
            truck.cargo(cargo);
        };
        const away = (truck) => {
            truck.group.position.x = OFF_X;
        };
        away(wood);
        away(azure);
        if (st.truck === "docked") {
            park(wood, 10);
        } else if (st.truck === "docked_out") {
            park(azure, 0);
        }
    }

    _drawSign(screen, text) {
        const { ctx, canvas, texture } = screen;
        ctx.fillStyle = "#f2c200";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#222";
        ctx.font = "bold 64px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        texture.needsUpdate = true;
    }

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

    // ---- animation -----------------------------------------------------------------
    _interrupt() {
        if (this._ctx) {
            this._ctx.aborted = true;
        }
    }

    /** The worker moves `total` crates between the truck bed and the pallets, then the truck leaves. */
    async _shuttle(ctx, { truck, fromTruck, trips, total, endStock }) {
        const startStock = this._stock;
        const gain = fromTruck ? endStock - startStock : startStock - endStock;
        const rear = this.layout.spots.truck.stand;
        const pallet = this.layout.spots.pallets.stand;
        const per = total / trips;
        const stockAt = (moved) => startStock + (fromTruck ? 1 : -1) * Math.round((gain * moved) / total);
        let moved = 0;
        for (let i = 0; i < trips; i++) {
            const [pickup, dropoff] = fromTruck ? [rear, pallet] : [pallet, rear];
            await walkTo(this, pickup, "walk", ctx);
            await faceTowards(this.animator, this.worker.group, fromTruck ? truck.group.position : this.pallets[0].group.position);
            this.worker.state = "reach";
            await this.animator.tween(0.35, () => {});
            if (fromTruck) {
                truck.cargo(Math.round(total - (moved + per)));
            } else {
                this._setStock(stockAt(moved + per));
            }
            await walkTo(this, dropoff, "carry", ctx);
            moved += per;
            if (fromTruck) {
                this._setStock(stockAt(moved));
            } else {
                truck.cargo(Math.round(moved));
            }
            this.worker.state = "reach";
            await this.animator.tween(0.3, () => {});
        }
        this.worker.state = "idle";
        const x0 = truck.group.position.x;
        await this.animator.tween(2.2, (k) => (truck.group.position.x = x0 + (OFF_X - x0) * k));
        await walkTo(this, this.layout.spots.centre.stand, "walk", ctx);
        this.worker.state = "idle";
    }

    _frame(dt, t) {
        const hover = this._hoverId === SCENE_OBJECT_IDS.terminal;
        const opacity = hover ? 0.45 : this._pulse ? 0.15 + 0.3 * (0.5 + 0.5 * Math.sin(t * 4)) : 0;
        this.desk.glow.material.opacity = opacity;
        this.desk.glow.visible = opacity > 0;
    }
}
