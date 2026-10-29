import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";
import { Component, onMounted, onWillUnmount, proxy, signal, useProps } from "@odoo/owl";
import { WarehouseScene, SCENE_OBJECT_IDS } from "@scale_up_game/three/scene";
import { setupInteractions } from "@scale_up_game/three/interactions";

const THREE_URL = "/scale_up_game/static/lib/three/three.min.js";
const SESSION_MODEL = "scale.up.game.session";
const LEVEL_CODE = "restock_shelf";

function errorMessage(error) {
    return error?.data?.message || error?.message || "Something went wrong. Please try again.";
}

export class GameRoot extends Component {
    static template = "scale_up_game.GameRoot";
    props = useProps({ ...standardActionServiceProps });

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.containerRef = signal.ref();
        this.anchorWRef = signal.ref();
        this.anchorTRef = signal.ref();
        this.state = proxy({
            loading: true,
            error: null,
            game: null,
            menu: null, // null | "terminal"
            hoverId: null,
            activity: null,
            speech: null,
            toast: null,
            toastType: "info",
            hintLevel: 0,
            hintStep: null,
            hintsUsed: 0,
            missionOpen: true,
            dialogOpen: false,
            animating: false,
            complete: false,
            showSummary: false,
            stock: null,
        });
        this.scene = null;
        this.destroyed = false;
        this.refreshing = false;
        this.pollTimer = null;
        this.timers = {};
        onMounted(() => this.start());
        onWillUnmount(() => this.cleanup());
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------
    async start() {
        try {
            await loadJS(THREE_URL);
            if (this.destroyed) {
                return;
            }
            this.scene = new WarehouseScene(window.THREE, this.containerRef(), {
                onFrame: () => this.updateOverlay(),
                onActivity: (label) => {
                    if (!this.destroyed) {
                        this.state.activity = label;
                    }
                },
            });
            this.disposeInteractions = setupInteractions(this.scene, {
                onClickObject: (id) => this.onClickObject(id),
                onClickBackground: () => this.closeMenu(),
                onHoverChange: (id) => this.onHoverChange(id),
            });
            // The initial state always comes from Odoo (never assumed).
            const game = await this.orm.call(SESSION_MODEL, "get_or_create_session", [], {
                level_code: LEVEL_CODE,
            });
            if (this.destroyed) {
                return;
            }
            this.state.loading = false;
            await this.applyGame(game, { initial: true });
        } catch (error) {
            if (!this.destroyed) {
                this.state.error = errorMessage(error);
            }
        } finally {
            if (!this.destroyed) {
                this.state.loading = false;
            }
        }
    }

    cleanup() {
        this.destroyed = true;
        this.stopPolling();
        document.body.classList.remove("o_su_hide_modals");
        Object.values(this.timers).forEach(clearTimeout);
        this.disposeInteractions?.();
        this.scene?.dispose();
        this.scene = null;
    }

    // ------------------------------------------------------------------
    // Server state -> scene
    // ------------------------------------------------------------------
    get currentStep() {
        return this.state.game?.steps.find((s) => !s.done) || null;
    }

    get hintText() {
        const step = this.currentStep;
        if (!step || !this.state.hintLevel || this.state.hintStep !== step.key) {
            return "";
        }
        const hints = this.state.game.hints[step.key] || [];
        return hints[Math.min(this.state.hintLevel, hints.length) - 1] || "";
    }

    get doneSteps() {
        return this.state.game ? this.state.game.steps.filter((s) => s.done).length : 0;
    }

    terminalLines(game) {
        const name = game.current_picking_name;
        if (game.stage === "none") {
            return { color: "#714b67", lines: ["Internal transfers", "Click to open"] };
        }
        if (game.stage === "done") {
            return { color: "#017e84", lines: [name, "Status: Done ✔"] };
        }
        if (game.stage === "ready") {
            return { color: "#017e84", lines: [name, "Status: Ready"] };
        }
        return { color: "#e8742c", lines: [name, "Status: In progress"] };
    }

    async applyGame(game, { initial = false } = {}) {
        const prevStage = this.state.game ? this.state.game.stage : null;
        this.state.game = game;
        const stage = game.stage;
        const scene = this.scene;
        // A new step resets the hint level and the terminal pulse.
        const step = this.currentStep;
        if (!step || step.key !== this.state.hintStep) {
            this.state.hintStep = step ? step.key : null;
            this.state.hintLevel = 0;
            scene.setTerminalPulse(false);
        }
        scene.setTerminalStatus({ title: "Inventory", ...this.terminalLines(game) });
        scene.setLabels({
            product: game.product_name,
            shelf: game.destination_location.split("/").pop(),
            source: game.source_location,
        });
        const willAnimate = stage === "done" && (game.newly_completed || (!initial && prevStage !== "done"));
        if (!willAnimate) {
            scene.setSourceStock(game.source_quantity);
            this.state.stock = { src: game.source_quantity, dst: game.destination_quantity };
            scene.setShelfStock(game.destination_quantity);
            scene.setOrderBoard(stage === "done");
        }
        this.state.complete = stage === "done" && !willAnimate;

        if (willAnimate) {
            await this.deliver(game);
        } else if (stage === "done") {
            scene.startWorking();
        } else if (stage === "ready") {
            if (initial || prevStage !== "ready") {
                scene.waitAtBox(!initial);
            }
        } else if (initial || prevStage === "ready") {
            scene.startWorking();
        }
        if (initial && stage === "none") {
            this.say(game.briefing, 8000);
        }
    }

    async deliver(game) {
        this.state.animating = true;
        this.state.menu = null;
        // Validated: close the transfer dialog/wizards (as happens after "Mark as To Do")
        // so the scene is fully visible while the bot works.
        if (this.state.dialogOpen) {
            this.state.dialogOpen = false;
            this.stopPolling();
            document.body.classList.add("o_su_hide_modals"); // no flicker while closing
            try {
                await this.closeDialogs();
            } finally {
                document.body.classList.remove("o_su_hide_modals");
            }
        }
        try {
            await this.scene.deliver();
        } finally {
            if (!this.destroyed) {
                this.state.animating = false;
            }
        }
        if (this.destroyed) {
            return;
        }
        this.scene.setShelfStock(game.destination_quantity);
        this.scene.setSourceStock(game.source_quantity);
        this.scene.setOrderBoard(true);
        this.state.stock = { src: game.source_quantity, dst: game.destination_quantity };
        this.state.complete = true;
        this.state.showSummary = true;
        this.say("Order shipped! Great job, boss!", 6000);
    }

    async closeDialogs() {
        const open = () => document.querySelector(".o_dialog, .modal.show, .modal.d-block");
        for (let i = 0; i < 4 && (i === 0 || open()); i++) {
            try {
                await this.action.doAction({ type: "ir.actions.act_window_close" });
            } catch {
                break;
            }
        }
    }

    startPolling() {
        this.stopPolling();
        // While the Odoo form is open, watch the document so the game reacts as soon as it is validated.
        this.pollTimer = setInterval(() => {
            if (this.state.dialogOpen) {
                this.refresh({ quiet: true });
            }
        }, 1500);
    }

    stopPolling() {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
    }

    async refresh({ quiet = false } = {}) {
        if (this.destroyed || this.refreshing || this.state.animating) {
            return;
        }
        this.refreshing = true;
        try {
            const game = await this.orm.call(SESSION_MODEL, "check_progress", [[this.state.game.session_id]]);
            if (this.destroyed) {
                return;
            }
            if (!game.success) {
                this.showToast(game.message || "Could not check your progress.", "danger");
                return;
            }
            await this.applyGame(game);
            if (!quiet && game.stage === "draft" && game.issues.length) {
                this.say("Hmm, something looks off with that transfer…", 5000);
            }
        } catch (error) {
            this.showToast(errorMessage(error), "danger");
        } finally {
            this.refreshing = false;
        }
    }

    // ------------------------------------------------------------------
    // Player interaction
    // ------------------------------------------------------------------
    onHoverChange(id) {
        this.state.hoverId = id;
        this.scene?.setHover(id);
    }

    onClickObject(id) {
        if (id === SCENE_OBJECT_IDS.terminal) {
            if (!this.state.animating && !this.state.dialogOpen) {
                this.state.menu = this.state.menu === "terminal" ? null : "terminal";
            }
        } else if (id === SCENE_OBJECT_IDS.worker) {
            this.state.menu = null;
            const game = this.state.game;
            if (!game) {
                return;
            }
            this.say(this.state.complete ? "All done here! The shelf is stocked." : game.briefing, 6000);
        } else {
            this.closeMenu();
        }
    }

    closeMenu() {
        this.state.menu = null;
    }

    onHint() {
        const step = this.currentStep;
        if (!step) {
            return;
        }
        if (this.state.hintStep !== step.key) {
            this.state.hintStep = step.key;
            this.state.hintLevel = 0;
        }
        if (this.state.hintLevel < 2) {
            this.state.hintLevel++;
            this.state.hintsUsed++;
        }
        // Second hint on the first step: make the terminal pulse.
        this.scene?.setTerminalPulse(step.key === "create" && this.state.hintLevel >= 2);
    }

    onNewTransfer() {
        return this.openTransfer(null);
    }

    onOpenMyTransfer() {
        return this.openTransfer(this.state.game.current_picking_id);
    }

    /** The player works with the REAL Odoo transfer form. */
    async openTransfer(resId) {
        if (this.state.dialogOpen || this.state.animating) {
            return;
        }
        this.state.menu = null;
        this.state.dialogOpen = true;
        const game = this.state.game;
        const action = {
            type: "ir.actions.act_window",
            name: resId ? "Transfer" : "New transfer",
            res_model: "stock.picking",
            views: [[false, "form"]],
            target: "new",
            context: resId ? {} : { default_picking_type_id: game.picking_type_id },
        };
        if (resId) {
            action.res_id = resId;
        }
        this.startPolling();
        try {
            await this.action.doAction(action, { onClose: () => this.onDialogClosed() });
        } catch (error) {
            this.state.dialogOpen = false;
            this.stopPolling();
            this.showToast(errorMessage(error), "danger");
        }
    }

    async onDialogClosed() {
        if (this.destroyed) {
            return;
        }
        this.state.dialogOpen = false;
        this.stopPolling();
        await this.refresh();
    }

    openCompletedTransfer() {
        const id = this.state.game.current_picking_id;
        if (id) {
            this.action.doAction({
                type: "ir.actions.act_window",
                res_model: "stock.picking",
                res_id: id,
                views: [[false, "form"]],
                target: "new",
            });
        }
    }

    toggleSummary() {
        this.state.showSummary = !this.state.showSummary;
    }

    toggleMission() {
        this.state.missionOpen = !this.state.missionOpen;
    }

    // ------------------------------------------------------------------
    // Small UI helpers
    // ------------------------------------------------------------------
    say(text, ms = 6000) {
        clearTimeout(this.timers.speech);
        this.state.speech = text;
        this.timers.speech = setTimeout(() => {
            if (!this.destroyed) {
                this.state.speech = null;
            }
        }, ms);
    }

    showToast(message, type = "info") {
        clearTimeout(this.timers.toast);
        this.state.toast = message;
        this.state.toastType = type;
        this.timers.toast = setTimeout(() => {
            if (!this.destroyed) {
                this.state.toast = null;
            }
        }, 4500);
    }

    /** Every frame: keep the HTML overlays attached to the worker / terminal. */
    updateOverlay() {
        if (!this.scene) {
            return;
        }
        for (const [ref, name] of [[this.anchorWRef, "worker"], [this.anchorTRef, "terminal"]]) {
            const el = ref();
            if (el) {
                const { x, y } = this.scene.getScreenPosition(name);
                el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
            }
        }
    }
}

registry.category("actions").add("scale_up_game.game_root", GameRoot);