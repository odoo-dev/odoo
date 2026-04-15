import {
    Component,
    xml,
    computed,
    signal,
    untrack,
    types,
    props,
    providePlugins,
    plugin,
} from "@odoo/owl";
import { browser } from "@web/core/browser/browser";
import { Dialog } from "@web/core/dialog/dialog";
import { memoize } from "@web/core/utils/functions";
import { Record } from "@web/model/record";
import { makeActiveField } from "@web/model/relational_model/utils";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

import { TranslateModel } from "./translation_model";

function smoothStickyTop(stickyClass, ref) {
    let isScrolling = false;
    let oldScrollTop = 0;
    const initialScrollTop = 0;
    let lastScrollTop = 0;
    return () => {
        const el = ref();
        if (isScrolling || !el) {
            return;
        }
        isScrolling = true;
        browser.requestAnimationFrame(() => (isScrolling = false));

        const scrollTop = el.offsetParent.scrollTop;
        const delta = Math.round(scrollTop - oldScrollTop);

        if (scrollTop > initialScrollTop) {
            // Beneath initial position => sticky display
            el.classList.add(stickyClass);
            if (delta <= 0) {
                // Going up | not moving
                lastScrollTop = Math.min(0, lastScrollTop - delta);
            } else {
                // Going down
                lastScrollTop = Math.max(-el.offsetHeight, -el.offsetTop - delta);
            }
            el.style.top = `${lastScrollTop}px`;
        } else {
            // Above initial position => standard display
            el.classList.remove(stickyClass);
            lastScrollTop = 0;
        }
        oldScrollTop = scrollTop;
    };
}

const childrenLoopTemplate = xml`
<t t-foreach="node.childNodes" t-as="c" t-key="c_index">
    <t t-if="c.nodeType === 1" t-call="{{ this.nodeTemplate }}" node="c"/>
    <t t-if="c.nodeType === 3" ><t t-out="c.textContent" /></t>
</t>
`;

const translateNodeTemplate = xml`
<t t-set="translateAttr" t-value="this.getTranslateAttributes(node)" />
<span class="d-block">
    <input class="d-inline ps-1 o-translate--translatable-block" t-att="translateAttr" t-att-value="this.getHashChange(this.model.getTranslationKey(translateAttr)) ?? (node.innerHTML or node.innerText)" />
</span>
`;

const attributeTemplate = xml`
<span class="o-att">
    <span class="o-att-name" t-out="attribute[0]" />=
    <t t-set="attrToNode" t-value="this.parseAttrXML(attribute[1])" />
    <t t-if="attrToNode">
        <t t-call="${translateNodeTemplate}" node="attrToNode"/>
    </t>
    <t t-else="">
        "<span class="o-att-value" t-out="attribute[1]"/>"
    </t>
</span>
`;

const nodeTemplate = xml`
<t t-set="renderMode" t-value="this._renderMode(node)" />
<li t-if="renderMode === 'nodeTemplate'" class="text-nowrap">
    <span class="text-muted">
        <span class="o-tag-name">&lt;<t t-out="node.tagName.toLowerCase()" /> </span>
        <t t-foreach="node.getAttributeNames()" t-as="attname" t-key="attname" >
            <t t-call="${attributeTemplate}" attribute="[attname, node.getAttribute(attname)]"/>
        </t>
        <span>&gt;</span>
    </span>
    <ul class="o-node-list">
        <t t-call="${childrenLoopTemplate}" node="node"/>
    </ul>
</li>
<t t-elif="renderMode === 'translateNode'">
    <t t-call="${translateNodeTemplate}" />
</t>
<t t-else="">
    <t t-call="${childrenLoopTemplate}" />
</t>
`;

export class TranslateXml extends Component {
    static template = "web.translate.TranslateXml";
    nodeTemplate = nodeTemplate;
    childrenLoopTemplate = childrenLoopTemplate;

    model = plugin(TranslateModel);
    rootRef = signal(null);
    langButtonsRef = signal(null);
    onScroll = smoothStickyTop("position-sticky", this.langButtonsRef);

    mimetype = computed(() =>
        this.model.field().type === "html" ? "text/html" : "application/xhtml+xml"
    );
    currentValue = computed(() =>
        this.parseXML(this.model.xmlValues()[this.model.currentLang()], this.mimetype())
    );

    parseXML = memoize((value, mimetype) => {
        const tree = new DOMParser().parseFromString(`<div>${value}</div>`, mimetype);
        if (tree instanceof HTMLDocument) {
            return tree.body;
        }
        return tree;
    });

    getHashChange(key) {
        // We want to store changes in the model to go back and forth between languages
        // But we don't want to trigger a render at each input
        // This is why we untrack the underlying reactive
        return untrack(() => this.model.getHashChange(null, key));
    }

    computeInputWidth(value) {
        // See the stylesheet for this component
        // this will be cast as a value in `ch`
        return Math.max(value.length, 10);
    }

    onInput(ev) {
        const target = ev.target;
        if (target.hasAttribute("data-oe-translation-state")) {
            const key = this.model.getTranslationKey(this.getTranslateAttributes(target));
            this.model.setHashChange(null, key, target.value);
            target.dataset.oeTranslationState = "translated";
            target.dataset.width = this.computeInputWidth(target.value);
        }
    }

    static translatableAttrRe = new RegExp("(<span.*>)(.*)(</span>)");
    parseAttrXML(string) {
        string = string?.trim();
        if (string?.startsWith("<span data-oe-model=")) {
            const matched = string.match(this.constructor.translatableAttrRe);
            if (matched.length === 4) {
                const text = matched[2];
                const dummy = this.parseXML(matched[1] + matched[3], "text/html").firstElementChild
                    .firstElementChild;
                dummy.innerText = text;
                return dummy;
            }
        }
    }

    getTranslateAttributes(node) {
        const obj = Object.fromEntries(
            node.getAttributeNames().map((attName) => [attName, node.getAttribute(attName)])
        );
        obj["data-width"] = this.computeInputWidth(node.innerHTML || node.innerText);
        return obj;
    }

    _renderMode(node) {
        if (node.getAttribute("data-oe-translation-state")) {
            if (!node.querySelector("[data-oe-translation-state]")) {
                return "translateNode";
            } else {
                return null;
            }
        }
        return "nodeTemplate";
    }
}

export class TranslateText extends Component {
    static template = "web.translate.TranslateText";
    static components = { Dropdown, DropdownItem };
    model = plugin(TranslateModel);

    get inputTag() {
        return (this.model.fieldType ?? "text") === "text" ? "textarea" : "input";
    }

    onChange(ev) {
        const target = ev.target;
        const lang = target.id;
        const value = target.value;
        this.model.setValue(lang, value);
    }
}

export class TranslateHTML extends TranslateText {
    static template = "web.translate.TranslateHTML";
    static components = { ...TranslateText.components, Record };

    propsHtmlField = props({
        "fieldComponentClass?": types.constructor(Component),
        "fieldComponentProps?": types.object(),
        "getFakeRecordInfos?": types.function(),
    });

    fakeRecordProps = computed(() => this._getfakeRecordProps());

    _getfakeRecordProps() {
        const { fields, activeFields, values, currentField } =
            this.propsHtmlField.getFakeRecordInfos?.() ?? {
                fields: {},
                activeFields: {},
                values: {},
                currentField: { type: "html" },
            };
        for (const lang in this.model.languages()) {
            fields[lang] = { ...currentField, translate: false, name: lang };
            activeFields[lang] = makeActiveField();
            values[lang] = this.model.getValue(lang);
        }

        return {
            fields,
            resModel: "dummy",
            resId: 1,
            mode: "edit",
            activeFields,
            hooks: {
                onRecordChanged: (record, changes) => {
                    for (const [fname, value] of Object.entries(changes)) {
                        this.model.setValue(fname, value);
                    }
                },
            },
            values,
        };
    }

    fieldComponentClass = computed(
        () =>
            this.propsHtmlField.fieldComponentClass ||
            registry.category("fields").get("html")?.component
    );

    fieldComponentProps = computed(() => ({
        ...this.propsHtmlField.fieldComponentProps,
        ...this.defaultComponentProps(this.fieldComponentClass),
    }));

    defaultComponentProps(Component) {
        return { codeview: true };
    }
}

export class TranslationDialog extends Component {
    static template = "web.translate.TranslationDialog";
    static components = {
        TranslateText,
        TranslateHTML,
        TranslateXml,
        Dialog,
    };

    props = props({
        "title?": types.signal(),
        "close?": types.function(),
        "fieldComponentClass?": types.constructor(Component),
        "fieldComponentProps?": types.object(),
        "getFakeRecordInfos?": types.function(),
        "Plugins?": types.array(),
        "config?": types.object(),
        "onSaved?": types.signal(types.function()),
    });

    dialogTitle = computed(() => this.props.title?.() ?? this.model.getTitle() ?? _t("Translate"));
    dialogSize = computed(() =>
        ["html", "xml"].includes(this.model.translateMode()) ? "fs" : "md"
    );

    setup() {
        providePlugins(this.props.Plugins ?? [TranslateModel], this.props.config);
        this.model = plugin(TranslateModel);
        if (this.props.onSaved) {
            this.model.on_saved.use(this.props.onSaved());
        }
        if (this.props.close) {
            this.model.on_saved.use(this.props.close);
        }
    }
}
