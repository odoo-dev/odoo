import { OfficeScene } from "@scale_up_game/three/scenes/office_scene";
import { makeBot } from "@scale_up_game/three/kit/characters";

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

    _buildStage() {
        const { THREE } = this;
        const floor = this.mesh(new THREE.PlaneGeometry(9, 11), this.mat(0xd9dde3, { roughness: 0.95 }), { y: 0, z: -1.55, cast: false });
        floor.rotation.x = -Math.PI / 2;
        this.scene.add(floor);
        const rug = this.mesh(new THREE.PlaneGeometry(4.4, 5.5), this.mat(0xc3bacd, { roughness: 1 }), { x: 0.05, y: 0.012, z: -2.25, cast: false });
        rug.rotation.x = -Math.PI / 2;
        this.scene.add(rug);
        const wall = this.mat(0xeceef2, { roughness: 0.95 });
        this.scene.add(this.box(9, 3.3, 0.18, wall, { y: 1.65, z: -5.95 }));
        this.scene.add(this.box(0.18, 3.3, 11, wall, { x: -4.4, y: 1.65, z: -1.55 }));
        this.scene.add(this.box(9, 0.12, 0.22, this.mat(0xd3d7dd), { y: 0.06, z: -5.93 }));
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

        // Centered glass door at the far wall: the bot visibly enters through it.
        const frame = this.mat(0x59636f, { roughness: 0.65 });
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
