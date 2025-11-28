import { describe, expect, test } from "@odoo/hoot";
import { insertText } from "../_helpers/user_actions";
import { setupEditor } from "../_helpers/editor";
import { getContent } from "../_helpers/selection";
import { CollaborationPlugin } from "@html_editor/others/collaboration/collaboration_plugin";
import { MAIN_PLUGINS } from "@html_editor/plugin_sets";

class TestCollaboration {
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
            this.log("  Init Editor for : ", name);
            peerId += 1;
            const content = initState[name];
            const className = name + "-test-editor";
            const { el, editor } = await setupEditor(content, {
                props: { iframe: true },
                styleContent: this.getContainerCssStyle(className, this.debugColors.shift()),
                config: {
                    Plugins: [...MAIN_PLUGINS, CollaborationPlugin],
                    collaboration: { peerId },
                    resources: {
                        collaboration_step_added_handlers: (step) => {
                            console.log(`collaboration_step_added_handlers : `, step);
                        },
                        history_missing_parent_step_handlers: (params) => {
                            // historyMissingParentSteps(peerInfos, peerInfo, params);
                            console.log(`history_missing_parent_step_handlers : `, params);
                        },
                    },
                },
            });

            el.classList.add(className);
            this.editors[name] = {
                el,
                editor,
                edit: async (fn) => {
                    this.log(name, " : edit | ", fn);
                    await fn(editor);
                    const historyPlugin = editor.plugins.find(
                        (p) => p.constructor.id === "history"
                    );

                    const historySteps = historyPlugin.steps;
                    return historySteps[historySteps.length - 1];
                },
                receive: (operation) => {
                    this.log(name, " : received operation | ", operation);
                    const collaborationPlugin = editor.plugins.find(
                        (p) => p.constructor.id === "collaboration"
                    );
                    collaborationPlugin.onExternalHistorySteps([operation]);
                },
                getContent: () => getContent(el),
            };
        }

        return this.editors;
    }

    log() {
        if (this.verbose) {
            console.log(...arguments);
        }
    }

    getContainerCssStyle(className, color) {
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

    get state() {
        const state = {};
        for (const name of Object.keys(this.editors)) {
            state[name] = this.editors[name].getContent();
        }
        this.log("TestCollaboration::get state()", state);
        return state;
    }
}
describe("concurent edition convergence", () => {
    test("three peers should be able to edit the document at the same location (1)", async () => {
        // @see : https://inria.hal.science/file/index/docid/108523/filename/OsterCSCW06.pdf
        const testCollaboration = new TestCollaboration({ verbose: true });
        const { alice, bobby, carol, danny } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
            carol: "<p>a[]b</p>",
            danny: "<p>a[]b</p>",
        });

        expect(testCollaboration.state).toEqual({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
            carol: "<p>a[]b</p>",
            danny: "<p>a[]b</p>",
        });

        const op1 = await alice.edit((e) => insertText(e, "1"));
        const op2 = await bobby.edit((e) => insertText(e, "2"));
        expect(testCollaboration.state).toEqual({
            alice: "<p>a1[]b</p>",
            bobby: "<p>a2[]b</p>",
            carol: "<p>a[]b</p>",
            danny: "<p>a[]b</p>",
        });

        carol.receive(op1);
        danny.receive(op1);
        expect(testCollaboration.state).toEqual({
            alice: "<p>a1[]b</p>",
            bobby: "<p>a2[]b</p>",
            carol: "<p>a[]1b</p>",
            danny: "<p>a[]1b</p>",
        });

        const op3 = carol.edit((e) => insertText(e, "3"));
        danny.receive(op2);
        expect(testCollaboration.state).toEqual({
            alice: "<p>a1[]b</p>",
            bobby: "<p>a2[]b</p>",
            carol: "<p>a3[]1b</p>",
            danny: "<p>a[]12b</p>",
        });
        alice.receive(op2);
        bobby.receive(op1);
        carol.receive(op2);
        danny.receive(op3);
        expect(testCollaboration.state).toEqual({
            alice: "<p>a1[]2b</p>",
            bobby: "<p>a12[]b</p>",
            carol: "<p>a3[]12b</p>",
            danny: "<p>a[]312b</p>",
        });

        alice.receive(op3);
        bobby.receive(op3);
        expect(testCollaboration.state).toEqual({
            alice: "<p>a31[]2b</p>",
            bobby: "<p>a312[]b</p>",
            carol: "<p>a3[]12b</p>",
            danny: "<p>a[]312b</p>",
        });
    });
});
