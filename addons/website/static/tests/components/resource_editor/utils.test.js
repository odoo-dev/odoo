import { describe, expect, test } from "@odoo/hoot";

import {
    findOperationTarget,
    getMicroViewInfo,
    getOperationRows,
    getOperationTargetRows,
    parseTargetArch,
} from "@website/components/resource_editor/utils";

function microViewArch(expr, attribute = `<attribute name="class" add="added" separator=" "/>`) {
    return `<data><xpath expr="${expr}" position="attributes">${attribute}</xpath></data>`;
}

function getMicroViewTargetElement(arch, xpath) {
    return findOperationTarget(parseTargetArch(arch, false).root, null, xpath);
}

function getMicroViewTargetRows(arch, xpaths) {
    return getOperationTargetRows(arch, false, xpaths);
}

function microViewXpath(expr) {
    return getMicroViewInfo(microViewArch(expr)).xpath;
}

describe("getMicroViewInfo", () => {
    test("detects micro views", () => {
        const info = getMicroViewInfo(microViewArch("//div[@id='target']"));
        expect(info.xpath.tagName).toBe("xpath");
        expect(info.xpath.getAttribute("expr")).toBe("//div[@id='target']");
        expect(info.attribute).toBe("class");
        expect(info.add).toBe("added");
    });

    test("keeps the attribute name as is", () => {
        const arch = microViewArch("//div", `<attribute name="t-attf-class" add="#{'a'}"/>`);
        const info = getMicroViewInfo(arch);
        expect(info.attribute).toBe("t-attf-class");
        expect(info.add).toBe("#{'a'}");
    });

    test("rejects views that are not micro views", () => {
        const archs = [
            // no operation
            "<data/>",
            // two operations
            `<data>
                <xpath expr="//div" position="attributes"><attribute name="class" add="a"/></xpath>
                <xpath expr="//span" position="attributes"><attribute name="class" add="b"/></xpath>
            </data>`,
            // not an xpath
            `<data><div position="attributes"><attribute name="class" add="a"/></div></data>`,
            // not position="attributes"
            `<data><xpath expr="//div" position="after"><span/></xpath></data>`,
            // no expr
            `<data><xpath position="attributes"><attribute name="class" add="a"/></xpath></data>`,
            // two attributes
            microViewArch(
                "//div",
                `<attribute name="class" add="a"/><attribute name="style" add="b"/>`
            ),
            // no name
            microViewArch("//div", `<attribute add="a"/>`),
            // no add
            microViewArch("//div", `<attribute name="class">a</attribute>`),
            // add and remove
            microViewArch("//div", `<attribute name="class" add="a" remove="b"/>`),
            // add and text content
            microViewArch("//div", `<attribute name="class" add="a">b</attribute>`),
        ];
        for (const arch of archs) {
            expect(getMicroViewInfo(arch)).toBe(null);
        }
    });
});

describe("getMicroViewTargetElement", () => {
    test("finds the target", () => {
        const xpath = microViewXpath("//div[@id='target']");
        const target = getMicroViewTargetElement(`<t><div/><div id="target"/></t>`, xpath);
        expect(target.getAttribute("id")).toBe("target");
    });

    test("supports hasclass", () => {
        const xpath = microViewXpath("//div[hasclass('foo')]");
        const target = getMicroViewTargetElement(
            `<t><div class="foobar"/><div id="target" class="bar foo"/></t>`,
            xpath
        );
        expect(target.getAttribute("id")).toBe("target");
    });

    test("returns null when there is no target", () => {
        const xpath = microViewXpath("//div[@id='target']");
        expect(getMicroViewTargetElement(`<t><div/></t>`, xpath)).toBe(null);
    });
});

describe("getMicroViewTargetRows", () => {
    test("returns the row where the opening tag of the target ends", () => {
        const arch = [
            "<t>",
            "    <div/>",
            '    <div id="target"',
            '         class="x">',
            "        y",
            "    </div>",
            "</t>",
        ].join("\n");
        expect(getMicroViewTargetRows(arch, [microViewXpath("//div[@id='target']")])).toEqual([3]);
    });

    test("ignores comments, CDATA sections and '>' in attribute values", () => {
        const arch = [
            "<t>",
            "    <!-- <div id='commented'> -->",
            '    <div t-if="a > b">',
            "        <![CDATA[ <div> ]]>",
            "    </div>",
            '    <div id="target"/>',
            "</t>",
        ].join("\n");
        expect(getMicroViewTargetRows(arch, [microViewXpath("//div[@id='target']")])).toEqual([5]);
    });

    test("counts the root among the elements sharing the target's tag name", () => {
        const arch = ["<t>", '    <t t-if="x"/>', "</t>"].join("\n");
        expect(getMicroViewTargetRows(arch, [microViewXpath("//t[@t-if]")])).toEqual([1]);
    });

    test("handles several xpaths, with or without target", () => {
        const arch = ["<t>", "<div>", "<span/>", "</div>", "</t>"].join("\n");
        const xpaths = ["//span", "//div", "//p"].map(microViewXpath);
        expect(getMicroViewTargetRows(arch, xpaths)).toEqual([2, 1, null]);
    });

    test("returns null when the arch is not well-formed", () => {
        expect(getMicroViewTargetRows("<t><div></t>", [microViewXpath("//div")])).toBe(null);
    });
});

describe("findOperationTarget", () => {
    test("ignores the operations of an inherited view's arch", () => {
        const arch = `<data>
            <header position="attributes"><attribute name="class">x</attribute></header>
            <xpath expr="//main" position="inside"><header id="inserted"/></xpath>
        </data>`;
        const { root, operations } = parseTargetArch(arch, true);
        const target = findOperationTarget(root, operations, microViewXpath("//header"));
        expect(target.getAttribute("id")).toBe("inserted");
    });

    test("does not locate absolute or positional expressions", () => {
        const { root } = parseTargetArch(`<t><div/><div/></t>`, false);
        expect(findOperationTarget(root, null, microViewXpath("/t/div"))).toBe(null);
        expect(findOperationTarget(root, null, microViewXpath("//div[2]"))).toBe(null);
    });
});

describe("getOperationRows", () => {
    test("returns the row of each operation", () => {
        const arch = [
            "<data>",
            '    <xpath expr="//main"',
            '           position="inside">',
            "        <div/>",
            "    </xpath>",
            '    <header position="attributes"/>',
            "</data>",
        ].join("\n");
        expect(getOperationRows(arch)).toEqual([2, 5]);
    });

    test("returns null when the arch is not well-formed", () => {
        expect(getOperationRows("<data><xpath></data>")).toBe(null);
    });
});
