import { setupEditor } from "../_helpers/editor";
import { getContent } from "../_helpers/selection";
import { CollaborationPlugin } from "@html_editor/others/collaboration/collaboration_plugin";
import { HistoryPlugin } from "@html_editor/core/history_plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";

class TestCollaborationEditor {
    verbose = false;
    debugColor = "black";

    constructor(verbose, debugColor) {
        this.verbose = verbose;
        this.debugColor = debugColor;
    }

    async init(name, peerId, initialContent) {
        this.name = name;
        this.peerId = peerId;
        this.log(`Init Editor with peerId: ${peerId}`);

        let n = 0;
        const originalGenerateId = HistoryPlugin.generateId;
        HistoryPlugin.prototype.generateId = () => `colab_unit_test_node_id_${n++}`; // todo : do this differently / better
        const className = `${name}-test-editor`;
        const { el, editor } = await setupEditor(initialContent, {
            props: { iframe: true },
            styleContent: this._getContainerCssStyle(className, this.debugColor),
            config: {
                Plugins: [...MAIN_PLUGINS, CollaborationPlugin],
                collaboration: { peerId },
                resources: {
                    collaboration_step_added_handlers: (step) => {
                        // this.log(
                        //     `collaboration_step_added_handlers : `,
                        //     step
                        // );
                    },
                    history_missing_parent_step_handlers: (params) => {
                        // historyMissingParentSteps(peerInfos, peerInfo, params);
                        // this.log(
                        //     `history_missing_parent_step_handlers : `,
                        //     params
                        // );
                    },
                },
            },
        });
        HistoryPlugin.generateId = originalGenerateId;

        this.el = el;
        this.editor = editor;
        el.classList.add(className);
    }

    async edit(fn) {
        this.log(`edit() : ${fn}`);
        await fn(this.editor);

        const historyPlugin = this._getPluginInstance("history");
        const historySteps = historyPlugin.steps;
        return historySteps[historySteps.length - 1];
    }

    receive(operation) {
        console.warn(`--- ${this.name} RECEIVES OPERATION ---`, operation);
        this.log(`receive() | ${operation?.mutations.length} mutations`);
        let index = 0;
        for (const mutation of operation.mutations) {
            this.log(` ┖> mutation[${index++}] : ${JSON.stringify(mutation)}`);
        }
        const collaborationPlugin = this._getPluginInstance("collaboration");
        collaborationPlugin.onExternalHistorySteps([operation]);
    }

    get content() {
        const content = getContent(this.el);
        this.log(`get content : ${content}`);
        return content;
    }

    get contentOnly() {
        const content = getContent(this.el, { showSelection: false });
        this.log(`get contentOnly : ${content}`);
        return content;
    }

    _getPluginInstance(pluginId) {
        return this.editor.plugins.find((p) => p.constructor.id === pluginId);
    }

    // private debug methods
    _getContainerCssStyle(className, color) {
        return `div.${className} {
                    border: 1px solid ${color};
                    margin : 18px 0;
                    position: relative;
                }
                div.${className}:before {
                    content: '${className}';
                    display: block;
                    font-size: 10px;
                    font-family: monospace;
                    position: absolute;
                    background: ${color};
                    color: white;
                    padding: 2px;
                    top: -20px;
                    left: 0;
                }\`;`;
    }

    log(msg) {
        if (this.verbose) {
            //colorized log per editor
            console.log(
                `[%c${this.name}%c] ${msg}`,
                `font-weight: bold; color: ${this.debugColor};`,
                "font-weight: normal; color: black;"
            );
        }
    }
}

export class TestCollaboration {
    editors = {};
    verbose = false;
    debugColors = ["red", "blue", "green", "orange", "purple", "brown"];

    constructor(options = {}) {
        if (options.verbose) {
            this.verbose = true;
        }
    }
    /**
     * @param { object } initState
     */
    async init(initState) {
        this.log("TestCollaboration::init()");
        // random collaboration channel id
        // const collaborationChannel = "collaboration-unit-test-" + Math.floor(Math.random() * 1000);
        let peerId = 0;

        for (const name of Object.keys(initState)) {
            peerId += 1;
            this.editors[name] = new TestCollaborationEditor(
                this.verbose,
                this.debugColors.shift()
            );
            await this.editors[name].init(name, peerId, initState[name]);
        }

        return this.editors;
    }

    log() {
        if (this.verbose) {
            console.log(...arguments);
        }
    }

    get state() {
        const state = {};
        for (const name of Object.keys(this.editors)) {
            state[name] = this.editors[name].content;
        }
        this.log("TestCollaboration::get state()", state);
        return state;
    }
}
