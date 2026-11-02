import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";
import { loadJS } from "@web/core/assets";
import { session } from "@web/session";
import { Component, onMounted, onWillUnmount, proxy, signal, t, useProps } from "@odoo/owl";
import { WarehouseScene, SCENE_OBJECT_IDS } from "@scale_up_game/three/scene";
import { DockScene } from "@scale_up_game/three/scenes/dock_scene";
import { OfficeScene } from "@scale_up_game/three/scenes/office_scene";
import { OfficePovScene } from "@scale_up_game/three/scenes/office_pov_scene";
import { Dialogue } from "@scale_up_game/components/dialogue";
import { setupInteractions } from "@scale_up_game/three/interactions";

const THREE_URL = "/scale_up_game/static/lib/three/three.min.js";
const SESSION_MODEL = "scale.up.game.session";

function errorMessage(error) {
    return error?.data?.message || error?.message || "Something went wrong. Please try again.";
}

export class GameRoot extends Component {
    static template = "scale_up_game.GameRoot";
    static components = { Dialogue };
    props = useProps({ levelCode: t.string(), onExit: t.function(), onReplay: t.function() });

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.containerRef = signal.ref();
        this.anchorWRef = signal.ref();
        this.anchorTRef = signal.ref();
        this.answerRef = signal.ref();
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
            chatting: false,
            tipSeen: false,
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
            // The initial state always comes from Odoo (never assumed). Starting an
            // attempt resumes the running one or seeds a fresh one: no manual reset.
            const game = await this.orm.call(SESSION_MODEL, "start_attempt", [], {
                level_code: this.props.levelCode,
            });
            if (this.destroyed) {
                return;
            }
            const SceneClass = { office: OfficeScene, office_pov: OfficePovScene, dock: DockScene }[game.scene_key] || WarehouseScene;
            this.scene = new SceneClass(window.THREE, this.containerRef(), {
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
        const prevGame = this.state.game;
        const prevStage = prevGame ? prevGame.stage : null;
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
        if (game.scenario) {
            return this.applyScenario(game, { initial, prevGame });
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

    /** Sub-level of a level group: the scene mirrors the confirmed Odoo state. */
    async applyScenario(game, { initial, prevGame }) {
        const scene = this.scene;
        const stage = game.stage;
        const willAnimate = stage === "done" && (game.newly_completed || (!initial && prevGame?.stage !== "done"));
        scene.applyState(willAnimate && prevGame ? prevGame : game);
        this.state.complete = stage === "done" && !willAnimate;
        if (willAnimate) {
            await this.deliver(game);
        } else if (!this.state.chatting) {
            scene.startWorking();
        }
        // The story is played click by click when the attempt starts.
        if (initial && stage !== "done" && game.chat.length) {
            this.state.chatting = true;
        }
    }

    get adminAvatarUrl() {
        return `/web/image/res.users/${user.userId}/avatar_128`;
    }

    get showTip() {
        return Boolean(
            this.state.game && !this.state.chatting && !this.state.tipSeen &&
            !this.state.complete && !this.state.animating && this.state.menu !== "terminal"
        );
    }

    replayStory() {
        this.state.menu = null;
        this.state.chatting = true;
    }

    onStoryDone = () => {
        this.state.chatting = false;
        this.scene?.startWorking();
        if (!this.state.tipSeen) {
            this.scene?.setTerminalPulse(true);
        }
    };

    onSpeaker = (who) => {
        this.scene?.setSpeaker?.(who);
    };

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
            await (game.scenario ? this.scene.celebrate(game) : this.scene.deliver());
        } finally {
            if (!this.destroyed) {
                this.state.animating = false;
            }
        }
        if (this.destroyed) {
            return;
        }
        if (!game.scenario) {
            this.scene.setShelfStock(game.destination_quantity);
            this.scene.setSourceStock(game.source_quantity);
            this.scene.setOrderBoard(true);
            this.state.stock = { src: game.source_quantity, dst: game.destination_quantity };
        }
        this.state.complete = true;
        this.state.showSummary = true;
        this.say(game.scenario ? "Level complete! Great job, boss!" : "Order shipped! Great job, boss!", 6000);
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
            this.orm.call(SESSION_MODEL, "register_hint", [[this.state.game.session_id], this.state.hintLevel]);
        }
        // Second hint on the first step: make the terminal pulse.
        this.scene?.setTerminalPulse(step.key === "create" && this.state.hintLevel >= 2);
    }

    get menuItems() {
        const game = this.state.game;
        if (game.scenario) {
            return game.terminal.items;
        }
        const items = [{ label: "New transfer", alt: false, action: this.transferAction(null) }];
        if (game.current_picking_id) {
            items.push({
                label: `Open my transfer (${game.current_picking_name})`,
                alt: true,
                action: this.transferAction(game.current_picking_id),
            });
        }
        return items;
    }

    transferAction(resId) {
        const action = {
            type: "ir.actions.act_window",
            name: resId ? "Transfer" : "New transfer",
            res_model: "stock.picking",
            views: [[false, "form"]],
            target: "new",
            context: resId ? {} : { default_picking_type_id: this.state.game.picking_type_id },
        };
        if (resId) {
            action.res_id = resId;
        }
        return action;
    }

    /** The player works with the REAL Odoo form, in a dialog. */
    async openDocument(action) {
        if (this.state.dialogOpen || this.state.animating) {
            return;
        }
        this.state.menu = null;
        this.state.dialogOpen = true;
        this.state.tipSeen = true;
        this.scene?.setTerminalPulse(false);
        this.startPolling();
        try {
            await this.action.doAction(action, { onClose: () => this.onDialogClosed() });
        } catch (error) {
            this.state.dialogOpen = false;
            this.stopPolling();
            this.showToast(errorMessage(error), "danger");
        }
    }

    get panelTitle() {
        const game = this.state.game;
        return game.scenario ? "INFO" : `STOCK ON HAND · ${game.product_name}`;
    }

    get panelRows() {
        const game = this.state.game;
        if (game.scenario) {
            return game.panel;
        }
        if (!this.state.stock) {
            return [];
        }
        return [
            { label: game.source_location, value: this.state.stock.src },
            { label: game.destination_location, value: this.state.stock.dst },
        ];
    }

    get missionTitle() {
        const game = this.state.game;
        return `${game.group_name || "Training"} · ${game.level_name}`;
    }

    async onSubmitAnswer() {
        const input = this.answerRef();
        if (!input || !input.value.trim() || this.refreshing) {
            return;
        }
        this.refreshing = true;
        try {
            const game = await this.orm.call(SESSION_MODEL, "submit_answer", [[this.state.game.session_id], input.value]);
            if (!game.success) {
                this.showToast(game.message, "danger");
                return;
            }
            this.refreshing = false;
            await this.applyGame(game);
            if (game.issues.length) {
                this.say("Hmm, that doesn't match the books…", 4000);
            }
        } catch (error) {
            this.showToast(errorMessage(error), "danger");
        } finally {
            this.refreshing = false;
        }
    }

    onDialogClosed() {
        if (this.destroyed) {
            return;
        }
        this.state.dialogOpen = false;
        this.stopPolling();
        // Not awaited: Odoo 20 awaits onClose before removing the dialog, and refresh()
        // may run the whole delivery animation.
        this.refresh();
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
