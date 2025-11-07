import { describe, expect, test } from "@odoo/hoot";
import { insertText } from "../_helpers/user_actions";

class CollaborationState {
    state = {};
    /**
     * @param { object } initState
     * @param {TestConfig} [options]
     * @returns { Promise<{el: HTMLElement; editor: Editor; plugins: Map<string,Plugin>}> }
     */
    constructor(initState) {
        this.state = initState;
    }
}
describe("concurent edition convergence", () => {
    test("three peers should be able to edit the document at the same location (1)", async () => {
        // @see : https://inria.hal.science/file/index/docid/108523/filename/OsterCSCW06.pdf
        const state = new CollaborationState({
            alice: "<div>a[]b</div>",
            bobby: "<div>a[]b</div>",
            carol: "<div>a[]b</div>",
            danny: "<div>a[]b</div>",
        });
        const { alice, bobby, carol, danny } = state;

        const op1 = alice.edit((e) => insertText(e, "1"));
        const op2 = bobby.edit((e) => insertText(e, "2"));
        expect(state).toBe({
            alice: "<div>a1[]b</div>",
            bobby: "<div>a2[]b</div>",
            carol: "<div>a[]b</div>",
            danny: "<div>a[]b</div>",
        });

        carol.receive(op1);
        danny.receive(op1);
        expect(state).toBe({
            alice: "<div>a1[]b</div>",
            bobby: "<div>a2[]b</div>",
            carol: "<div>a[]1b</div>",
            danny: "<div>a[]1b</div>",
        });

        const op3 = carol.edit((e) => insertText(e, "3"));
        danny.receive(op2);
        expect(state).toBe({
            alice: "<div>a1[]b</div>",
            bobby: "<div>a2[]b</div>",
            carol: "<div>a3[]1b</div>",
            danny: "<div>a[]12b</div>",
        });

        alice.receive(op2);
        bobby.receive(op1);
        carol.receive(op2);
        danny.receive(op3);
        expect(state).toBe({
            alice: "<div>a1[]2b</div>",
            bobby: "<div>a12[]b</div>",
            carol: "<div>a3[]12b</div>",
            danny: "<div>a[]312b</div>",
        });

        alice.receive(op3);
        bobby.receive(op3);
        expect(state).toBe({
            alice: "<div>a31[]2b</div>",
            bobby: "<div>a312[]b</div>",
            carol: "<div>a3[]12b</div>",
            danny: "<div>a[]312b</div>",
        });
    });
});
