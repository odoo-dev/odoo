import { describe, expect, test } from "@odoo/hoot";

import {
    getMicroViewInfo,
    getMicroViewTargetElement,
    getMicroViewTargetRange,
    injectMicroViewAttributes,
    stripMicroViewAttributes,
} from "@website/components/resource_editor/utils";

function microViewArch(expr, attribute = `<attribute name="class" add="added" separator=" "/>`) {
    return `<data><xpath expr="${expr}" position="attributes">${attribute}</xpath></data>`;
}

function microView(expr, key = "website.my_view", attribute) {
    return { microViewInfo: getMicroViewInfo(microViewArch(expr, attribute), key) };
}

describe("getMicroViewInfo", () => {
    test("detects micro views", () => {
        const info = getMicroViewInfo(microViewArch("//div[@id='target']"), "website.my_view");
        expect(info.xpath.tagName).toBe("xpath");
        expect(info.xpath.getAttribute("expr")).toBe("//div[@id='target']");
        expect(info.name).toBe("t-attf-class");
        expect(info.value).toBe("#{is_view_active(website.my_view) and 'added'}");
        expect(info.text).toBe(`t-attf-class="#{is_view_active(website.my_view) and 'added'}"`);
    });

    test("strips the t-att(f)- prefix of the attribute name", () => {
        for (const name of ["t-attf-class", "t-att-class"]) {
            const arch = microViewArch("//div", `<attribute name="${name}" add="added"/>`);
            expect(getMicroViewInfo(arch, "website.my_view").name).toBe("t-attf-class");
        }
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
            // no add
            microViewArch("//div", `<attribute name="class">a</attribute>`),
            // add and remove
            microViewArch("//div", `<attribute name="class" add="a" remove="b"/>`),
            // add and text content
            microViewArch("//div", `<attribute name="class" add="a">b</attribute>`),
        ];
        for (const arch of archs) {
            expect(getMicroViewInfo(arch, "website.my_view")).toBe(null);
        }
    });
});

describe("getMicroViewTargetElement", () => {
    test("finds the target", () => {
        const { xpath } = microView("//div[@id='target']").microViewInfo;
        const target = getMicroViewTargetElement(`<t><div/><div id="target"/></t>`, xpath);
        expect(target.getAttribute("id")).toBe("target");
    });

    test("supports hasclass", () => {
        const { xpath } = microView("//div[hasclass('foo')]").microViewInfo;
        const target = getMicroViewTargetElement(
            `<t><div class="foobar"/><div id="target" class="bar foo"/></t>`,
            xpath
        );
        expect(target.getAttribute("id")).toBe("target");
    });

    test("returns null when there is no target", () => {
        const { xpath } = microView("//div[@id='target']").microViewInfo;
        expect(getMicroViewTargetElement(`<t><div/></t>`, xpath)).toBe(null);
    });
});

describe("getMicroViewTargetRange", () => {
    test("locates the opening tag among same-tag elements", () => {
        const { xpath } = microView("//div[@id='target']").microViewInfo;
        const arch = `<t>\n<div>\n<div/>\n</div>\n<div id="target" class="x">y</div>\n</t>`;
        const range = getMicroViewTargetRange(arch, xpath);
        expect(arch.slice(range.start, range.end)).toBe(`<div id="target" class="x">`);
    });

    test("locates a self-closing tag", () => {
        const { xpath } = microView("//div[@id='target']").microViewInfo;
        const arch = `<t><div/><div id="target"/></t>`;
        const range = getMicroViewTargetRange(arch, xpath);
        expect(arch.slice(range.start, range.end)).toBe(`<div id="target"/>`);
    });

    test("returns null when there is no target", () => {
        const { xpath } = microView("//div[@id='target']").microViewInfo;
        expect(getMicroViewTargetRange(`<t><div/></t>`, xpath)).toBe(null);
    });
});

describe("injectMicroViewAttributes / stripMicroViewAttributes", () => {
    test("injects on an opening tag", () => {
        const mv = microView("//div[@id='target']");
        const arch = `<t>\n<div id="target" class="x">y</div>\n</t>`;
        const injected = injectMicroViewAttributes(arch, [mv]);
        expect(injected).toBe(
            `<t>\n<div id="target" class="x" ${mv.microViewInfo.text}>y</div>\n</t>`
        );
        expect(stripMicroViewAttributes(injected, [mv])).toBe(arch);
    });

    test("injects on a self-closing tag", () => {
        const mv = microView("//div[@id='target']");
        const arch = `<t><div id="target"/></t>`;
        const injected = injectMicroViewAttributes(arch, [mv]);
        expect(injected).toBe(`<t><div id="target" ${mv.microViewInfo.text}/></t>`);
        expect(stripMicroViewAttributes(injected, [mv])).toBe(arch);
    });

    test("injects several micro views, on the same tag or not", () => {
        const mvs = [
            microView("//div[@id='target']", "website.a"),
            microView("//div[@id='target']", "website.b"),
            microView("//span", "website.c"),
        ];
        const arch = `<t>\n<div id="target">\n<span/>\n</div>\n</t>`;
        const injected = injectMicroViewAttributes(arch, mvs);
        for (const { microViewInfo } of mvs) {
            expect(injected).toInclude(microViewInfo.text);
        }
        expect(stripMicroViewAttributes(injected, mvs)).toBe(arch);
    });

    test("ignores micro views without target", () => {
        const mv = microView("//div[@id='missing']");
        const arch = `<t><div id="target"/></t>`;
        expect(injectMicroViewAttributes(arch, [mv])).toBe(arch);
        expect(stripMicroViewAttributes(arch, [mv])).toBe(arch);
    });
});
