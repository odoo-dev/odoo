import { Animator } from "@scale_up_game/three/animations";
import { animateActor } from "@scale_up_game/three/kit/characters";

/**
 * Reusable 3D scene shell: renderer, camera, lights, material/texture helpers,
 * confetti, render loop and clean disposal. A level's scene extends it and only
 * builds its layout from the props/characters of the kit.
 *
 * Contract used by GameRoot and the interaction layer:
 *   interactives, camera, renderer, setHover(id), setTerminalPulse(on),
 *   getScreenPosition("worker"|"terminal"), startWorking(), applyState(game),
 *   celebrate(game), dispose().
 */
export class BaseScene {
    constructor(THREE, container, { onFrame, onActivity, cameraTarget = [0.5, 0.9, -0.4], cameraOffset = [8, 8, 10] } = {}) {
        this.THREE = THREE;
        this.container = container;
        this.onFrame = onFrame;
        this.onActivity = onActivity;
        this.animator = new Animator();
        this.disposed = false;
        this.zoom = 1;
        this.cameraTarget = cameraTarget;
        this.cameraOffset = cameraOffset;
        this.interactives = [];
        this.actors = []; // rigs animated every frame (see kit/characters.js)
        this._materials = [];
        this._textures = [];
        this._confetti = [];
        this._hoverId = null;
        this._pulse = false;
        this._initRenderer();
        this._buildLights();
        this._resizeObserver = new ResizeObserver(() => this._resize());
        this._resizeObserver.observe(container);
        this._onWheel = (ev) => {
            ev.preventDefault();
            this.zoom = Math.min(1.4, Math.max(0.6, this.zoom + Math.sign(ev.deltaY) * 0.06));
            this._updateCamera();
        };
        this.renderer.domElement.addEventListener("wheel", this._onWheel, { passive: false });
        this._clock = new THREE.Clock();
        this._loop = this._loop.bind(this);
    }

    /** Call once the subclass finished building its layout. */
    start() {
        this._resize();
        this._raf = requestAnimationFrame(this._loop);
    }

    // ---- helpers ---------------------------------------------------------
    mat(color, opts = {}) {
        const m = new this.THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, ...opts });
        this._materials.push(m);
        return m;
    }

    basic(color, opts = {}) {
        const m = new this.THREE.MeshBasicMaterial({ color, ...opts });
        this._materials.push(m);
        return m;
    }

    mesh(geometry, material, { x = 0, y = 0, z = 0, cast = true, receive = true } = {}) {
        const mesh = new this.THREE.Mesh(geometry, material);
        mesh.position.set(x, y, z);
        mesh.castShadow = cast;
        mesh.receiveShadow = receive;
        return mesh;
    }

    box(w, h, d, material, pos = {}) {
        return this.mesh(new this.THREE.BoxGeometry(w, h, d), material, pos);
    }

    /** Canvas texture: returns {texture, canvas, ctx}. */
    tex(w, h, draw) {
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

    // ---- public API -------------------------------------------------------
    setHover(id) {
        this._hoverId = id;
    }

    setTerminalPulse(on) {
        this._pulse = on;
    }

    setWorkerState(state) {
        this.worker.state = state;
    }

    getScreenPosition(name) {
        const character = this.worker?.group.position || this.ceo?.group.position || this.anchors.terminal;
        const p = name === "terminal" ? this.anchors.terminal : character;
        const v = new this.THREE.Vector3(p.x, name === "terminal" ? p.y : p.y + 1.55, p.z);
        v.project(this.camera);
        return {
            x: (v.x * 0.5 + 0.5) * this.container.clientWidth,
            y: (-v.y * 0.5 + 0.5) * this.container.clientHeight,
        };
    }

    burstConfetti(center = [0, 3.5, 0], spread = [7, 5]) {
        const { THREE } = this;
        if (!this._confettiMats) {
            this._confettiMats = [0x714b67, 0x017e84, 0xff9f1c, 0xf4f1f6, 0xe74c3c].map((c) => this.basic(c, { side: THREE.DoubleSide }));
            this._confettiGeo = new THREE.PlaneGeometry(0.1, 0.06);
        }
        for (let i = 0; i < 110; i++) {
            const mesh = new THREE.Mesh(this._confettiGeo, this._confettiMats[i % this._confettiMats.length]);
            mesh.position.set(
                center[0] + (Math.random() - 0.5) * spread[0], center[1] + Math.random() * 1.5,
                center[2] + (Math.random() - 0.5) * spread[1]);
            mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            this.scene.add(mesh);
            this._confetti.push({
                mesh, vy: -(0.7 + Math.random() * 1.0), spin: (Math.random() - 0.5) * 8,
                phase: Math.random() * 6, life: 4 + Math.random() * 1.5,
            });
        }
    }

    dispose() {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this._interrupt?.();
        cancelAnimationFrame(this._raf);
        this.animator.cancelAll();
        this._resizeObserver.disconnect();
        this.renderer.domElement.removeEventListener("wheel", this._onWheel);
        this.scene.traverse((obj) => obj.geometry?.dispose());
        this._confettiGeo?.dispose();
        this._materials.forEach((m) => m.dispose());
        this._textures.forEach((t) => t.dispose());
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
        this.renderer.domElement.remove();
    }

    // ---- internals ----------------------------------------------------------
    _frame() {} // subclass hook, every frame

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
        this.scene.fog = new THREE.Fog(0xd9e1ea, 26, 48);
        this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
        this._updateCamera();
    }

    _updateCamera() {
        const t = this.cameraTarget;
        const o = this.cameraOffset;
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
        const sun = new THREE.DirectionalLight(0xfff0d2, 0.95);
        sun.position.set(-5, 9, 5);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const c = sun.shadow.camera;
        c.left = -13;
        c.right = 13;
        c.top = 11;
        c.bottom = -11;
        c.near = 1;
        c.far = 34;
        this.scene.add(sun);
        const fill = new THREE.DirectionalLight(0xcfe0ff, 0.25);
        fill.position.set(6, 5, 8);
        this.scene.add(fill);
    }

    _loop() {
        if (this.disposed) {
            return;
        }
        this._raf = requestAnimationFrame(this._loop);
        const dt = Math.min(this._clock.getDelta(), 0.05);
        const t = this._clock.elapsedTime;
        this.animator.update(dt);
        for (const rig of this.actors) {
            animateActor(rig, dt, t);
        }
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
        this._frame(dt, t);
        this.renderer.render(this.scene, this.camera);
        this.onFrame?.();
    }
}
