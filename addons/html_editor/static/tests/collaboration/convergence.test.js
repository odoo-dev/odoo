import { describe, expect, test } from "@odoo/hoot";
import { insertText } from "../_helpers/user_actions";
import { TestCollaboration } from "./utils";

const VERBOSE_LOGGING = { verbose: true };

describe("concurent edition should convergence", () => {
    test("when peer2 receive peer1 change", async () => {
        const testCollaboration = new TestCollaboration();
        const { alice, bobby } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
        });

        expect(alice.contentOnly).toBe("<p>ab</p>");
        expect(bobby.contentOnly).toBe("<p>ab</p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>ab</p>");

        bobby.receive(aliceInsert1);

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>a1b</p>");
    });
    test("when peers edit simultaniously", async () => {
        const testCollaboration = new TestCollaboration(VERBOSE_LOGGING);
        const { alice, bobby } = await testCollaboration.init({
            alice: "<p><b>ab[]</b><i>cd</i></p>",
            bobby: "<p><b>ab</b><i>cd[]</i></p>",
        });

        expect(alice.contentOnly).toBe("<p><b>ab</b><i>cd</i></p>");
        expect(bobby.contentOnly).toBe("<p><b>ab</b><i>cd</i></p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));
        const bobbyInsert1 = await bobby.edit((e) => insertText(e, "2"));

        expect(alice.contentOnly).toBe("<p><b>ab1</b><i>cd</i></p>");
        expect(bobby.contentOnly).toBe("<p><b>ab</b><i>cd2</i></p>");

        alice.receive(bobbyInsert1);
        bobby.receive(aliceInsert1);

        expect(alice.contentOnly).toBe("<p><b>ab1</b><i>cd2</i></p>");
        expect(bobby.contentOnly).toBe("<p><b>ab1</b><i>cd2</i></p>");
    });
    test.todo("when peers edit simultaniously in the same node", async () => {
        const testCollaboration = new TestCollaboration(VERBOSE_LOGGING);
        const { alice, bobby } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
        });

        expect(alice.contentOnly).toBe("<p>ab</p>");
        expect(bobby.contentOnly).toBe("<p>ab</p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));
        const bobbyInsert1 = await bobby.edit((e) => insertText(e, "2"));

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>a2b</p>");

        alice.receive(bobbyInsert1);
        bobby.receive(aliceInsert1);

        expect(alice.contentOnly).toBe("<p>a12b</p>");
        expect(bobby.contentOnly).toBe("<p>a12b</p>");
    });
    test.todo("three peers edit the document at the same location", async () => {
        // @see : https://inria.hal.science/file/index/docid/108523/filename/OsterCSCW06.pdf
        const testCollaboration = new TestCollaboration(VERBOSE_LOGGING);
        const { alice, bobby, carol } = await testCollaboration.init({
            alice: "<p>a[]b</p>",
            bobby: "<p>a[]b</p>",
            carol: "<p>a[]b</p>",
        });

        expect(alice.contentOnly).toBe("<p>ab</p>");
        expect(bobby.contentOnly).toBe("<p>ab</p>");
        expect(carol.contentOnly).toBe("<p>ab</p>");

        const aliceInsert1 = await alice.edit((e) => insertText(e, "1"));
        const bobbyInsert1 = await bobby.edit((e) => insertText(e, "2"));

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>a2b</p>");
        expect(carol.contentOnly).toBe("<p>ab</p>");

        carol.receive(aliceInsert1);

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>a2b</p>");
        expect(carol.contentOnly).toBe("<p>a1b</p>");

        const carolInsert1 = await carol.edit((e) => insertText(e, "3"));

        expect(alice.contentOnly).toBe("<p>a1b</p>");
        expect(bobby.contentOnly).toBe("<p>a2b</p>");
        expect(carol.contentOnly).toBe("<p>a31b</p>");

        alice.receive(bobbyInsert1);
        bobby.receive(aliceInsert1);
        carol.receive(bobbyInsert1);

        expect(alice.contentOnly).toBe("<p>a12b</p>");
        expect(bobby.contentOnly).toBe("<p>a12b</p>");
        expect(carol.contentOnly).toBe("<p>a312b</p>");

        alice.receive(carolInsert1);
        bobby.receive(carolInsert1);

        expect(alice.contentOnly).toBe("<p>a312b</p>");
        expect(bobby.contentOnly).toBe("<p>a312b</p>");
        expect(carol.contentOnly).toBe("<p>a312b</p>");
    });
});
