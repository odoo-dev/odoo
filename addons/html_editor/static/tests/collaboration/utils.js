import { setupEditor } from "../_helpers/editor";
import { getContent } from "../_helpers/selection";
import { CollaborationPlugin } from "@html_editor/others/collaboration/collaboration_plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";

class TestCollaborationEditor {
    verbose = false;

    constructor(parent) {
        this.parent = parent;
    }
    async init(name, peerId, initialContent, debugColors = null) {
        this.parent.log(`  Init Editor, name : ${name}, peerId: ${peerId}`);
        this.name = name;
        this.peerId = peerId;

        const className = `${name}-test-editor`;
        const { el, editor } = await setupEditor(initialContent, {
            props: { iframe: true },
            styleContent: this._getContainerCssStyle(className, debugColors),
            config: {
                Plugins: [...MAIN_PLUGINS, CollaborationPlugin],
                collaboration: { peerId },
                resources: {
                    collaboration_step_added_handlers: (step) => {
                        this.parent.log(
                            `[${this.name}] collaboration_step_added_handlers : `,
                            step
                        );
                    },
                    history_missing_parent_step_handlers: (params) => {
                        // historyMissingParentSteps(peerInfos, peerInfo, params);
                        this.parent.log(
                            `[${this.name}] history_missing_parent_step_handlers : `,
                            params
                        );
                    },
                },
            },
        });

        this.el = el;
        this.editor = editor;
        el.classList.add(className);
    }

    async edit(fn) {
        this.parent.log(`[${this.name}] edit() : `, fn);
        await fn(this.editor);

        const historyPlugin = this._getPluginInstance("history");
        const historySteps = historyPlugin.steps;
        return historySteps[historySteps.length - 1];
    }

    receive(operation) {
        this.parent.log(`[${this.name}] receive() : `, operation);
        const collaborationPlugin = this._getPluginInstance("collaboration");
        collaborationPlugin.onExternalHistorySteps([operation]);
    }

    get content() {
        const content = getContent(this.el);
        this.parent.log(`[${this.name}] get content : `, content);
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
}

export class TestCollaboration {
    editors = {};
    verbose = false;
    debugColors = ["red", "green", "blue", "orange", "purple", "brown"];

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
            this.editors[name] = new TestCollaborationEditor(this);
            await this.editors[name].init(name, peerId, initState[name], this.debugColors.shift());
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
