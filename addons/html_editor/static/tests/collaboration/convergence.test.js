import { describe, expect, test } from "@odoo/hoot";
import { insertText } from "../_helpers/user_actions";
import { TestCollaboration } from "./utils";

describe("concurent edition convergence", () => {
    test("sample colab test", async () => {
        const testCollaboration = new TestCollaboration({ verbose: true });
        const { alice, bobby } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
        });

        expect(alice.content).toBe("<p>a[]b</p>");
        expect(bobby.content).toBe("<p>a[]b</p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));

        expect(alice.content).toBe("<p>a1[]b</p>");
        expect(bobby.content).toBe("<p>a[]b</p>");

        bobby.receive(aliceInsert1);
        expect(bobby.content).toBe("<p>a1[]b</p>");
    });
    test("sample colab test 2", async () => {
        const testCollaboration = new TestCollaboration({ verbose: true });
        const { alice, bobby } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
        });

        expect(alice.content).toBe("<p>a[]b</p>");
        expect(bobby.content).toBe("<p>a[]b</p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));
        const bobbyInsert1 = await bobby.edit((e) => insertText(e, "a"));

        expect(alice.content).toBe("<p>a1[]b</p>");
        expect(bobby.content).toBe("<p>aa[]b</p>");

        bobby.receive(aliceInsert1);
        alice.receive(bobbyInsert1);

        expect(alice.content).toBe("<p>aa1[]b</p>");
        expect(bobby.content).toBe("<p>aa1[]b</p>");
    });
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
