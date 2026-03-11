import { after, expect, test } from "@odoo/hoot";
import { Component, useRef, xml, clearThisTracking, getThisTrackingReport } from "@odoo/owl";
import { mountWithCleanup, patchTranslations } from "@web/../tests/web_test_helpers";
import {
    clearProcessedTemplates,
    getTemplate,
    registerTemplate,
    registerTemplateExtension,
    setUrlFilters,
} from "@web/core/templates";

function makeTemplate({ name, content, inheritFrom }) {
    return `<t t-name="${name}" ${inheritFrom ? `t-inherit="${inheritFrom}"` : ``}>${content}</t>`;
}

function makeTemplateExtension({ content, inheritFrom }) {
    return `<t t-inherit="${inheritFrom}" t-inherit-mode="extension">${content}</t>`;
}

function visit(node, addon, terms) {
    for (const { value } of node.attributes) {
        terms[value] = `${value} (${addon})`;
    }
    for (const childNode of node.childNodes) {
        if (childNode.nodeType === Node.TEXT_NODE) {
            const text = childNode.data.trim();
            terms[text] = `${text} (${addon})`;
        } else {
            visit(childNode, addon, terms);
        }
    }
}

const parser = new DOMParser();
function extractTranslations(template, addon) {
    const doc = parser.parseFromString(template, "text/xml");
    const root = doc.firstChild;
    const terms = {};
    visit(root, addon, terms);
    return terms;
}

function registerTemplates(...templates) {
    const translations = {};

    for (const { name, content, inheritFrom, inheritMode } of templates) {
        // we should avoid do twice makeTemplate/makeTemplateExtension
        const template =
            inheritMode === "extension"
                ? makeTemplateExtension({ content, inheritFrom })
                : makeTemplate({ name, content, inheritFrom });
        const addon = `addon_${name}`;
        const terms = extractTranslations(template, addon);
        translations[addon] = terms;
        after(
            inheritMode === "extension"
                ? registerTemplateExtension(inheritFrom, `/${addon}`, template)
                : registerTemplate(name, `/${addon}`, template)
        );
    }
    patchTranslations(translations);
}

async function mountTestComponentWithTemplate(name) {
    class TestComponent extends Component {
        static props = ["*"];
        static template = xml`<div t-ref="root"><t t-call="${name}"/></div>`;
        setup() {
            this.rootRef = useRef("root");
        }
    }
    const component = await mountWithCleanup(TestComponent);
    return component.rootRef.el;
}

test("translation-context: single template", async () => {
    registerTemplates({
        name: "A",
        content: `
            <div class="o_test_component" title="title">
                text
            </div>
        `,
    });
    const el = await mountTestComponentWithTemplate("A");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_A)">
            text (addon_A)
        </div>
    `);
});

test("translation-context: xpath position replace (outer)", async () => {
    registerTemplates(
        { name: "A", content: `<div class="o_test_component" title="title"> text </div>` },
        {
            name: "B",
            content: `
                <xpath expr="div" position="replace">
                    <div class="o_test_component" title="title"> text </div>
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_B)">
            text (addon_B)
        </div>
    `);
});

test("translation-context: xpath position replace (outer) with $0", async () => {
    registerTemplates(
        { name: "A", content: `<div class="o_test_component" title="title"> text </div>` },
        {
            name: "B",
            content: `
                <xpath expr="div" position="replace">
                    <div class="o_test_component" title="title">
                        text
                        <div title="title2">$0</div>
                    </div>
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_B)">
            text (addon_B)
            <div title="title2 (addon_B)">
                <div class="o_test_component" title="title (addon_A)">
                    text (addon_A)
                </div>
            </div>
        </div>
    `);
});

test("translation-context: xpath position replace (inner)", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component" title="title">
                    text
                    <span> text </span>
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div" position="replace" mode="inner">
                    <span>
                        text
                        <div title="title"> text </div>
                    </span>
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_A)">
            <span>
                text (addon_B)
                <div title="title (addon_B)">
                    text (addon_B)
                </div>
            </span>
        </div>
    `);
});

test("translation-context: xpath position attributes", async () => {
    registerTemplates(
        { name: "A", content: `<div class="o_test_component" title="title"> text </div>` },
        {
            name: "B",
            content: `
                <xpath expr="div" position="attributes">
                    <attribute name="title">title</attribute>
                    <attribute name="label">label</attribute>
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_B)" label="label (addon_B)">
            text (addon_A)
        </div>
    `);
});

test("translation-context: xpath position inside", async () => {
    registerTemplates(
        { name: "A", content: `<div class="o_test_component" title="title"> text </div>` },
        {
            name: "B",
            content: `
                <xpath expr="div" position="inside">
                    text
                    <span title="title"> text </span>
                    text
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_A)">
            text (addon_A) text (addon_B)
            <span title="title (addon_B)">
                text (addon_B)
            </span>
            text (addon_B)
        </div>
    `);
});

test("translation-context: xpath position inside: moved element", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component">
                    <span>Hello</span>
                    <span>World</span>
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div/span" position="before">
                    <xpath expr="div/span[2]" position="move"/>
                </xpath>`,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component">
            <span>World (addon_A)</span>
            <span>Hello (addon_A)</span>
        </div>
    `);
});

test("translation-context: xpath position after with some text", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component" title="title">
                    <span>text1</span>
                    <span>text2</span>
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div/span" position="after">
                    <div title="title">
                        text1
                    </div>
                    text2
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_A)">
            <span>
                text1 (addon_A)
            </span>
            <div title="title (addon_B)">
                text1 (addon_B)
            </div>
            text2 (addon_B)
            <span>
                text2 (addon_A)
            </span>
        </div>
    `);
});

test("translation-context: xpath position before with some text", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component" title="title">
                    <span>text1</span>
                    <span>text2</span>
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div/span" position="before">
                    <div title="title">
                        text1
                    </div>
                    text2
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_A)">
            <div title="title (addon_B)">
                text1 (addon_B)
            </div>
            text2 (addon_B)
            <span>
                text1 (addon_A)
            </span>
            <span>
                text2 (addon_A)
            </span>
        </div>
    `);
});

test("translation-context: wrappers texts in t tags", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component">
                    Hello
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div" position="inside">
                    World
                </xpath>`,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("B");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component">
            Hello (addon_A) World (addon_B)
        </div>
    `);
});

test("translation-context: wrappers texts in t tags (2)", async () => {
    after(setUrlFilters([]));
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component">
                    Hello
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div" position="inside">
                    World
                </xpath>`,
            inheritFrom: "A",
            inheritMode: "extension",
        }
    );
    const el = await mountTestComponentWithTemplate("A");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component">
            Hello (addon_A) World (addon_B)
        </div>
    `);
});

test("translation-context: wrappers texts in t tags (3)", async () => {
    after(setUrlFilters([]));
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component" title="title">
                    text
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div" position="inside">
                    text
                </xpath>`,
            inheritFrom: "A",
            inheritMode: "extension",
        },
        {
            name: "C",
            content: `
                <xpath expr="div" position="replace">
                    <div class="o_test_component" title="title">
                        text
                        <div title="title2">$0</div>
                    </div>
                </xpath>
            `,
            inheritFrom: "A",
        }
    );
    const el = await mountTestComponentWithTemplate("C");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component" title="title (addon_C)">
            text (addon_C)
            <div title="title2 (addon_C)">
                <div class="o_test_component" title="title (addon_A)">
                    text (addon_A) text (addon_B)
                </div>
            </div>
        </div>
    `);
});

test("translation-context: wrappers around texts do not affect xpaths (1)", async () => {
    registerTemplates(
        {
            name: "A",
            content: `
                <div class="o_test_component">
                    Hello
                    <t t-if="true">
                        Janet
                    </t>
                </div>
            `,
        },
        {
            name: "B",
            content: `
                <xpath expr="div/t" position="before">
                    World
                </xpath>`,
            inheritFrom: "A",
        },
        {
            name: "C",
            content: `
                <xpath expr="div/t" position="replace" mode="inner">
                    Jamie
                </xpath>`,
            inheritFrom: "B",
        }
    );
    const el = await mountTestComponentWithTemplate("C");
    expect(el).toHaveInnerHTML(`
        <div class="o_test_component">
            Hello (addon_A) World (addon_B)  Jamie (addon_C)
        </div>
    `);
});

// ---------------------------------------------------------------------------
// Source file tracking via t-source-file
//
// These tests use real XML template files bundled through the normal pipeline:
//   - source_file_tracking_base.xml      (base template: web.SourceFileBase)
//   - source_file_tracking_primary.xml   (primary inherit: web.SourceFilePrimary)
//   - source_file_tracking_extension.xml (extension on web.SourceFileBase)
// ---------------------------------------------------------------------------

const BASE_URL = "/web/static/tests/core/source_file_tracking_base.xml";
const PRIMARY_URL = "/web/static/tests/core/source_file_tracking_primary.xml";
const EXTENSION_URL = "/web/static/tests/core/source_file_tracking_extension.xml";

test("source-file: base template root gets t-source-file from its url", async () => {
    const el = getTemplate("web.SourceFileBase");
    expect(el.getAttribute("t-source-file")).toBe(BASE_URL);
});

test("source-file: base template children do not have t-source-file", async () => {
    const el = getTemplate("web.SourceFileBase");
    const span = el.querySelector("span.original");
    expect(span).not.toBe(null);
    expect(span.hasAttribute("t-source-file")).toBe(false);
});

test("source-file: primary inherit root gets base file, added elements get inherit file", async () => {
    const el = getTemplate("web.SourceFilePrimary");
    // The root <div> originates from the base template
    expect(el.getAttribute("t-source-file")).toBe(BASE_URL);
    // The <p> was added by primary inherit
    const p = el.querySelector("p.from-primary");
    expect(p).not.toBe(null);
    expect(p.getAttribute("t-source-file")).toBe(PRIMARY_URL);
    // The original <span> from base has no t-source-file
    const span = el.querySelector("span.original");
    expect(span).not.toBe(null);
    expect(span.hasAttribute("t-source-file")).toBe(false);
});

test("source-file: extension adds t-source-file from extension file url", async () => {
    const el = getTemplate("web.SourceFileBase");
    // The <em> was added by the extension
    const em = el.querySelector("em.from-extension");
    expect(em).not.toBe(null);
    expect(em.getAttribute("t-source-file")).toBe(EXTENSION_URL);
    // Root still has the base url
    expect(el.getAttribute("t-source-file")).toBe(BASE_URL);
});

// ---------------------------------------------------------------------------
// Component-level source file tracking
//
// These tests mount actual components and verify that getThisTrackingReport()
// correctly reports the `file` property for each property access, showing
// which XML source file contributed each expression.
// ---------------------------------------------------------------------------

test("source-file: component with primary inherit reports correct file per access", async () => {
    clearThisTracking();
    clearProcessedTemplates();

    class TestComp extends Component {
        static template = "web.SourceFilePrimary";
        static props = ["*"];
        baseValue = "from-base";
        primaryValue = "from-primary";
    }

    await mountWithCleanup(TestComp);

    const report = getThisTrackingReport();
    const accesses = Object.values(report.accesses).filter(
        (a) => a.templateName === "web.SourceFilePrimary"
    );
    expect(accesses.length).toBeGreaterThan(0);

    // baseValue comes from the base template XML
    const baseAccess = accesses.find((a) => a.property === "baseValue");
    expect(baseAccess).not.toBe(undefined);
    expect(baseAccess.filename).toBe(BASE_URL);

    // primaryValue comes from the primary inherit XML
    const primaryAccess = accesses.find((a) => a.property === "primaryValue");
    expect(primaryAccess).not.toBe(undefined);
    expect(primaryAccess.filename).toBe(PRIMARY_URL);
});

test("source-file: component with extension reports correct file per access", async () => {
    clearThisTracking();
    clearProcessedTemplates();

    class TestComp extends Component {
        static template = "web.SourceFileBase";
        static props = ["*"];
        baseValue = "from-base";
        extensionValue = "from-extension";
    }

    await mountWithCleanup(TestComp);

    const report = getThisTrackingReport();
    const accesses = Object.values(report.accesses).filter(
        (a) => a.templateName === "web.SourceFileBase"
    );
    expect(accesses.length).toBeGreaterThan(0);

    // baseValue comes from the base template XML
    const baseAccess = accesses.find((a) => a.property === "baseValue");
    expect(baseAccess).not.toBe(undefined);
    expect(baseAccess.filename).toBe(BASE_URL);

    // extensionValue comes from the extension XML
    const extAccess = accesses.find((a) => a.property === "extensionValue");
    expect(extAccess).not.toBe(undefined);
    expect(extAccess.filename).toBe(EXTENSION_URL);
});

test("source-file: tracks getter access inside t-set t-value and used in t-call", async () => {
    registerTemplates({
        name: "myTemplate",
        content: `<t t-out="x.name"/>`,
    });
    class TestComp extends Component {
        static template = xml`
            <div>
                <t t-set="x" t-value="this.foo"/>
                <t t-call="myTemplate"/>
            </div>`;
        setup() {
            this.name = "test";
        }
        get foo() {
            return { name: this.name };
        }
    }

    await mountWithCleanup(TestComp);

    const report = getThisTrackingReport();
    const accesses = Object.values(report.accesses);
    const fooAccess = accesses.find((a) => a.property === "foo");
    expect(fooAccess).not.toBe(undefined);
    expect(fooAccess.expression).toBe("this.foo");

    const gas = Object.values(report.getterAccesses);
    const nameAccess = gas.find((g) => g.property === "name");
    expect(nameAccess).not.toBe(undefined);
    expect(nameAccess.getterName).toBe("foo");

    const xAccess = Object.values(report.accesses).find((a) => a.property === "x");
    expect(xAccess).not.toBe(undefined);
    expect(xAccess.source).toBe("ctx");
    expect(xAccess.templateName).toBe("myTemplate");
});
