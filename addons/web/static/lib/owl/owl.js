(function (exports) {
    'use strict';

    function filterOutModifiersFromData(dataList) {
        dataList = dataList.slice();
        const modifiers = [];
        let elm;
        while ((elm = dataList[0]) && typeof elm === "string") {
            modifiers.push(dataList.shift());
        }
        return { modifiers, data: dataList };
    }
    const config = {
        // whether or not blockdom should normalize DOM whenever a block is created.
        // Normalizing dom mean removing empty text nodes (or containing only spaces)
        shouldNormalizeDom: true,
        // this is the main event handler. Every event handler registered with blockdom
        // will go through this function, giving it the data registered in the block
        // and the event
        mainEventHandler: (data, ev, currentTarget) => {
            if (typeof data === "function") {
                data(ev);
            }
            else if (Array.isArray(data)) {
                data = filterOutModifiersFromData(data).data;
                data[0](data[1], ev);
            }
            return false;
        },
    };

    // -----------------------------------------------------------------------------
    // Toggler node
    // -----------------------------------------------------------------------------
    class VToggler {
        constructor(key, child) {
            this.key = key;
            this.child = child;
        }
        mount(parent, afterNode) {
            this.parentEl = parent;
            this.child.mount(parent, afterNode);
        }
        moveBefore(other, afterNode) {
            this.child.moveBefore(other ? other.child : null, afterNode);
        }
        patch(other, withBeforeRemove) {
            if (this === other) {
                return;
            }
            let child1 = this.child;
            let child2 = other.child;
            if (this.key === other.key) {
                child1.patch(child2, withBeforeRemove);
            }
            else {
                child2.mount(this.parentEl, child1.firstNode());
                if (withBeforeRemove) {
                    child1.beforeRemove();
                }
                child1.remove();
                this.child = child2;
                this.key = other.key;
            }
        }
        beforeRemove() {
            this.child.beforeRemove();
        }
        remove() {
            this.child.remove();
        }
        firstNode() {
            return this.child.firstNode();
        }
        toString() {
            return this.child.toString();
        }
    }
    function toggler(key, child) {
        return new VToggler(key, child);
    }

    const { setAttribute, removeAttribute } = Element.prototype;
    const tokenList = DOMTokenList.prototype;
    const tokenListAdd = tokenList.add;
    const tokenListRemove = tokenList.remove;
    const isArray = Array.isArray;
    const { split, trim } = String.prototype;
    const wordRegexp = /\s+/;
    /**
     * We regroup here all code related to updating attributes in a very loose sense:
     * attributes, properties and classs are all managed by the functions in this
     * file.
     */
    function createAttrUpdater(attr) {
        return function (value) {
            if (value !== false) {
                setAttribute.call(this, attr, value === true ? "" : value);
            }
        };
    }
    function attrsSetter(attrs) {
        if (isArray(attrs)) {
            setAttribute.call(this, attrs[0], attrs[1]);
        }
        else {
            for (let k in attrs) {
                setAttribute.call(this, k, attrs[k]);
            }
        }
    }
    function attrsUpdater(attrs, oldAttrs) {
        if (isArray(attrs)) {
            const name = attrs[0];
            const val = attrs[1];
            if (name === oldAttrs[0]) {
                if (val === oldAttrs[1]) {
                    return;
                }
                setAttribute.call(this, name, val);
            }
            else {
                removeAttribute.call(this, oldAttrs[0]);
                setAttribute.call(this, name, val);
            }
        }
        else {
            for (let k in oldAttrs) {
                if (!(k in attrs)) {
                    removeAttribute.call(this, k);
                }
            }
            for (let k in attrs) {
                const val = attrs[k];
                if (val !== oldAttrs[k]) {
                    setAttribute.call(this, k, val);
                }
            }
        }
    }
    function toClassObj(expr) {
        const result = {};
        switch (typeof expr) {
            case "string":
                // we transform here a list of classes into an object:
                //  'hey you' becomes {hey: true, you: true}
                const str = trim.call(expr);
                if (!str) {
                    return {};
                }
                let words = split.call(str, wordRegexp);
                for (let i = 0, l = words.length; i < l; i++) {
                    result[words[i]] = true;
                }
                return result;
            case "object":
                // this is already an object but we may need to split keys:
                // {'a': true, 'b c': true} should become {a: true, b: true, c: true}
                for (let key in expr) {
                    const value = expr[key];
                    if (value) {
                        const words = split.call(key, wordRegexp);
                        for (let word of words) {
                            result[word] = value;
                        }
                    }
                }
                return result;
            case "undefined":
                return {};
            case "number":
                return { [expr]: true };
            default:
                return { [expr]: true };
        }
    }
    function setClass(val) {
        val = val === "" ? {} : toClassObj(val);
        // add classes
        const cl = this.classList;
        for (let c in val) {
            tokenListAdd.call(cl, c);
        }
    }
    function updateClass(val, oldVal) {
        oldVal = oldVal === "" ? {} : toClassObj(oldVal);
        val = val === "" ? {} : toClassObj(val);
        const cl = this.classList;
        // remove classes
        for (let c in oldVal) {
            if (!(c in val)) {
                tokenListRemove.call(cl, c);
            }
        }
        // add classes
        for (let c in val) {
            if (!(c in oldVal)) {
                tokenListAdd.call(cl, c);
            }
        }
    }
    function makePropSetter(name) {
        return function setProp(value) {
            this[name] = value;
        };
    }
    function isProp(tag, key) {
        switch (tag) {
            case "input":
                return (key === "checked" ||
                    key === "indeterminate" ||
                    key === "value" ||
                    key === "readonly" ||
                    key === "disabled");
            case "option":
                return key === "selected" || key === "disabled";
            case "textarea":
                return key === "value" || key === "readonly" || key === "disabled";
            case "select":
                return key === "value" || key === "disabled";
            case "button":
            case "optgroup":
                return key === "disabled";
        }
        return false;
    }

    function createEventHandler(rawEvent) {
        const eventName = rawEvent.split(".")[0];
        const capture = rawEvent.includes(".capture");
        if (rawEvent.includes(".synthetic")) {
            return createSyntheticHandler(eventName, capture);
        }
        else {
            return createElementHandler(eventName, capture);
        }
    }
    // Native listener
    let nextNativeEventId = 1;
    function createElementHandler(evName, capture = false) {
        let eventKey = `__event__${evName}_${nextNativeEventId++}`;
        if (capture) {
            eventKey = `${eventKey}_capture`;
        }
        function listener(ev) {
            const currentTarget = ev.currentTarget;
            if (!currentTarget || !document.contains(currentTarget))
                return;
            const data = currentTarget[eventKey];
            if (!data)
                return;
            config.mainEventHandler(data, ev, currentTarget);
        }
        function setup(data) {
            this[eventKey] = data;
            this.addEventListener(evName, listener, { capture });
        }
        function update(data) {
            this[eventKey] = data;
        }
        return { setup, update };
    }
    // Synthetic handler: a form of event delegation that allows placing only one
    // listener per event type.
    let nextSyntheticEventId = 1;
    function createSyntheticHandler(evName, capture = false) {
        let eventKey = `__event__synthetic_${evName}`;
        if (capture) {
            eventKey = `${eventKey}_capture`;
        }
        setupSyntheticEvent(evName, eventKey, capture);
        const currentId = nextSyntheticEventId++;
        function setup(data) {
            const _data = this[eventKey] || {};
            _data[currentId] = data;
            this[eventKey] = _data;
        }
        return { setup, update: setup };
    }
    function nativeToSyntheticEvent(eventKey, event) {
        let dom = event.target;
        while (dom !== null) {
            const _data = dom[eventKey];
            if (_data) {
                for (const data of Object.values(_data)) {
                    const stopped = config.mainEventHandler(data, event, dom);
                    if (stopped)
                        return;
                }
            }
            dom = dom.parentNode;
        }
    }
    const CONFIGURED_SYNTHETIC_EVENTS = {};
    function setupSyntheticEvent(evName, eventKey, capture = false) {
        if (CONFIGURED_SYNTHETIC_EVENTS[eventKey]) {
            return;
        }
        document.addEventListener(evName, (event) => nativeToSyntheticEvent(eventKey, event), {
            capture,
        });
        CONFIGURED_SYNTHETIC_EVENTS[eventKey] = true;
    }

    const getDescriptor$3 = (o, p) => Object.getOwnPropertyDescriptor(o, p);
    const nodeProto$4 = Node.prototype;
    const nodeInsertBefore$3 = nodeProto$4.insertBefore;
    const nodeSetTextContent$1 = getDescriptor$3(nodeProto$4, "textContent").set;
    const nodeRemoveChild$3 = nodeProto$4.removeChild;
    // -----------------------------------------------------------------------------
    // Multi NODE
    // -----------------------------------------------------------------------------
    class VMulti {
        constructor(children) {
            this.children = children;
        }
        mount(parent, afterNode) {
            const children = this.children;
            const l = children.length;
            const anchors = new Array(l);
            for (let i = 0; i < l; i++) {
                let child = children[i];
                if (child) {
                    child.mount(parent, afterNode);
                }
                else {
                    const childAnchor = document.createTextNode("");
                    anchors[i] = childAnchor;
                    nodeInsertBefore$3.call(parent, childAnchor, afterNode);
                }
            }
            this.anchors = anchors;
            this.parentEl = parent;
        }
        moveBefore(other, afterNode) {
            if (other) {
                const next = other.children[0];
                afterNode = (next ? next.firstNode() : other.anchors[0]) || null;
            }
            const children = this.children;
            const parent = this.parentEl;
            const anchors = this.anchors;
            for (let i = 0, l = children.length; i < l; i++) {
                let child = children[i];
                if (child) {
                    child.moveBefore(null, afterNode);
                }
                else {
                    const anchor = anchors[i];
                    nodeInsertBefore$3.call(parent, anchor, afterNode);
                }
            }
        }
        patch(other, withBeforeRemove) {
            if (this === other) {
                return;
            }
            const children1 = this.children;
            const children2 = other.children;
            const anchors = this.anchors;
            const parentEl = this.parentEl;
            for (let i = 0, l = children1.length; i < l; i++) {
                const vn1 = children1[i];
                const vn2 = children2[i];
                if (vn1) {
                    if (vn2) {
                        vn1.patch(vn2, withBeforeRemove);
                    }
                    else {
                        const afterNode = vn1.firstNode();
                        const anchor = document.createTextNode("");
                        anchors[i] = anchor;
                        nodeInsertBefore$3.call(parentEl, anchor, afterNode);
                        if (withBeforeRemove) {
                            vn1.beforeRemove();
                        }
                        vn1.remove();
                        children1[i] = undefined;
                    }
                }
                else if (vn2) {
                    children1[i] = vn2;
                    const anchor = anchors[i];
                    vn2.mount(parentEl, anchor);
                    nodeRemoveChild$3.call(parentEl, anchor);
                }
            }
        }
        beforeRemove() {
            const children = this.children;
            for (let i = 0, l = children.length; i < l; i++) {
                const child = children[i];
                if (child) {
                    child.beforeRemove();
                }
            }
        }
        remove() {
            const parentEl = this.parentEl;
            if (this.isOnlyChild) {
                nodeSetTextContent$1.call(parentEl, "");
            }
            else {
                const children = this.children;
                const anchors = this.anchors;
                for (let i = 0, l = children.length; i < l; i++) {
                    const child = children[i];
                    if (child) {
                        child.remove();
                    }
                    else {
                        nodeRemoveChild$3.call(parentEl, anchors[i]);
                    }
                }
            }
        }
        firstNode() {
            const child = this.children[0];
            return child ? child.firstNode() : this.anchors[0];
        }
        toString() {
            return this.children.map((c) => c.toString()).join("");
        }
    }
    function multi(children) {
        return new VMulti(children);
    }

    const getDescriptor$2 = (o, p) => Object.getOwnPropertyDescriptor(o, p);
    const nodeProto$3 = Node.prototype;
    const characterDataProto$1 = CharacterData.prototype;
    const nodeInsertBefore$2 = nodeProto$3.insertBefore;
    const characterDataSetData$1 = getDescriptor$2(characterDataProto$1, "data").set;
    const nodeRemoveChild$2 = nodeProto$3.removeChild;
    class VText$1 {
        constructor(text) {
            this.text = text;
        }
        mount(parent, afterNode) {
            this.parentEl = parent;
            const node = document.createTextNode(toText(this.text));
            nodeInsertBefore$2.call(parent, node, afterNode);
            this.el = node;
        }
        moveBefore(other, afterNode) {
            const target = other ? other.el : afterNode;
            nodeInsertBefore$2.call(this.parentEl, this.el, target);
        }
        patch(other) {
            const text2 = other.text;
            if (this.text !== text2) {
                characterDataSetData$1.call(this.el, toText(text2));
                this.text = text2;
            }
        }
        beforeRemove() { }
        remove() {
            nodeRemoveChild$2.call(this.parentEl, this.el);
        }
        firstNode() {
            return this.el;
        }
        toString() {
            return this.text;
        }
    }
    function text(str) {
        return new VText$1(str);
    }
    function toText(value) {
        switch (typeof value) {
            case "string":
                return value;
            case "number":
                return String(value);
            case "boolean":
                return value ? "true" : "false";
            default:
                return value || "";
        }
    }

    const getDescriptor$1 = (o, p) => Object.getOwnPropertyDescriptor(o, p);
    const nodeProto$2 = Node.prototype;
    const elementProto = Element.prototype;
    const characterDataProto = CharacterData.prototype;
    const characterDataSetData = getDescriptor$1(characterDataProto, "data").set;
    const nodeGetFirstChild = getDescriptor$1(nodeProto$2, "firstChild").get;
    const nodeGetNextSibling = getDescriptor$1(nodeProto$2, "nextSibling").get;
    const NO_OP$1 = () => { };
    const cache = {};
    /**
     * Compiling blocks is a multi-step process:
     *
     * 1. build an IntermediateTree from the HTML element. This intermediate tree
     *    is a binary tree structure that encode dynamic info sub nodes, and the
     *    path required to reach them
     * 2. process the tree to build a block context, which is an object that aggregate
     *    all dynamic info in a list, and also, all ref indexes.
     * 3. process the context to build appropriate builder/setter functions
     * 4. make a dynamic block class, which will efficiently collect references and
     *    create/update dynamic locations/children
     *
     * @param str
     * @returns a new block type, that can build concrete blocks
     */
    function createBlock(str) {
        if (str in cache) {
            return cache[str];
        }
        // step 0: prepare html base element
        const doc = new DOMParser().parseFromString(`<t>${str}</t>`, "text/xml");
        const node = doc.firstChild.firstChild;
        if (config.shouldNormalizeDom) {
            normalizeNode(node);
        }
        // step 1: prepare intermediate tree
        const tree = buildTree(node);
        // step 2: prepare block context
        const context = buildContext(tree);
        // step 3: build the final block class
        const template = tree.el;
        const Block = buildBlock(template, context);
        cache[str] = Block;
        return Block;
    }
    // -----------------------------------------------------------------------------
    // Helper
    // -----------------------------------------------------------------------------
    function normalizeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (!/\S/.test(node.textContent)) {
                node.remove();
                return;
            }
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === "pre") {
                return;
            }
        }
        for (let i = node.childNodes.length - 1; i >= 0; --i) {
            normalizeNode(node.childNodes.item(i));
        }
    }
    function buildTree(node, parent = null, domParentTree = null) {
        switch (node.nodeType) {
            case Node.ELEMENT_NODE: {
                // HTMLElement
                let isActive = false;
                let currentNS = parent && parent.currentNS;
                const tagName = node.tagName;
                let el = undefined;
                const info = [];
                if (tagName.startsWith("block-text-")) {
                    const index = parseInt(tagName.slice(11), 10);
                    info.push({ type: "text", idx: index });
                    el = document.createTextNode("");
                    isActive = true;
                }
                if (tagName.startsWith("block-child-")) {
                    domParentTree.forceRef = true;
                    const index = parseInt(tagName.slice(12), 10);
                    info.push({ type: "child", idx: index });
                    el = document.createTextNode("");
                    isActive = true;
                }
                const attrs = node.attributes;
                const ns = attrs.getNamedItem("block-ns");
                if (ns) {
                    attrs.removeNamedItem("block-ns");
                    currentNS = ns.value;
                }
                if (!el) {
                    el = currentNS
                        ? document.createElementNS(currentNS, tagName)
                        : document.createElement(tagName);
                }
                if (el instanceof Element) {
                    for (let i = 0; i < attrs.length; i++) {
                        const attrName = attrs[i].name;
                        const attrValue = attrs[i].value;
                        if (attrName.startsWith("block-handler-")) {
                            isActive = true;
                            const idx = parseInt(attrName.slice(14), 10);
                            info.push({
                                type: "handler",
                                idx,
                                event: attrValue,
                            });
                        }
                        else if (attrName.startsWith("block-attribute-")) {
                            isActive = true;
                            const idx = parseInt(attrName.slice(16), 10);
                            info.push({
                                type: "attribute",
                                idx,
                                name: attrValue,
                                tag: tagName,
                            });
                        }
                        else if (attrName === "block-attributes") {
                            isActive = true;
                            info.push({
                                type: "attributes",
                                idx: parseInt(attrValue, 10),
                            });
                        }
                        else if (attrName === "block-ref") {
                            isActive = true;
                            info.push({
                                type: "ref",
                                idx: parseInt(attrValue, 10),
                            });
                        }
                        else {
                            el.setAttribute(attrs[i].name, attrValue);
                        }
                    }
                }
                const tree = {
                    parent,
                    firstChild: null,
                    nextSibling: null,
                    el,
                    info,
                    refN: isActive ? 1 : 0,
                    currentNS,
                };
                if (node.firstChild) {
                    const childNode = node.childNodes[0];
                    if (node.childNodes.length === 1 &&
                        childNode.nodeType === Node.ELEMENT_NODE &&
                        childNode.tagName.startsWith("block-child-")) {
                        const tagName = childNode.tagName;
                        const index = parseInt(tagName.slice(12), 10);
                        info.push({ idx: index, type: "child", isOnlyChild: true });
                        isActive = true;
                        tree.refN = 1;
                    }
                    else {
                        tree.firstChild = buildTree(node.firstChild, tree, tree);
                        el.appendChild(tree.firstChild.el);
                        let curNode = node.firstChild;
                        let curTree = tree.firstChild;
                        while ((curNode = curNode.nextSibling)) {
                            curTree.nextSibling = buildTree(curNode, curTree, tree);
                            el.appendChild(curTree.nextSibling.el);
                            curTree = curTree.nextSibling;
                        }
                    }
                }
                if (isActive) {
                    let cur = tree;
                    while ((cur = cur.parent)) {
                        cur.refN++;
                    }
                }
                return tree;
            }
            case Node.TEXT_NODE:
            case Node.COMMENT_NODE: {
                // text node or comment node
                const el = node.nodeType === Node.TEXT_NODE
                    ? document.createTextNode(node.textContent)
                    : document.createComment(node.textContent);
                return {
                    parent: parent,
                    firstChild: null,
                    nextSibling: null,
                    el,
                    info: [],
                    refN: 0,
                    currentNS: null,
                };
            }
        }
        throw new Error("boom");
    }
    function parentTree(tree) {
        let parent = tree.parent;
        while (parent && parent.nextSibling === tree) {
            tree = parent;
            parent = parent.parent;
        }
        return parent;
    }
    function buildContext(tree, ctx, fromIdx, toIdx) {
        if (!ctx) {
            const children = new Array(tree.info.filter((v) => v.type === "child").length);
            ctx = { collectors: [], locations: [], children, cbRefs: [], refN: tree.refN };
            fromIdx = 0;
            tree.refN - 1;
        }
        if (tree.refN) {
            const initialIdx = fromIdx;
            const isRef = tree.forceRef || tree.info.length > 0;
            const firstChild = tree.firstChild ? tree.firstChild.refN : 0;
            const nextSibling = tree.nextSibling ? tree.nextSibling.refN : 0;
            //node
            if (isRef) {
                for (let info of tree.info) {
                    info.refIdx = initialIdx;
                }
                tree.refIdx = initialIdx;
                updateCtx(ctx, tree);
                fromIdx++;
            }
            // right
            if (nextSibling) {
                const idx = fromIdx + firstChild;
                ctx.collectors.push({ idx, prevIdx: initialIdx, getVal: nodeGetNextSibling });
                buildContext(tree.nextSibling, ctx, idx);
            }
            // left
            if (firstChild) {
                ctx.collectors.push({ idx: fromIdx, prevIdx: initialIdx, getVal: nodeGetFirstChild });
                buildContext(tree.firstChild, ctx, fromIdx);
            }
        }
        return ctx;
    }
    function updateCtx(ctx, tree) {
        for (let info of tree.info) {
            switch (info.type) {
                case "text":
                    ctx.locations.push({
                        idx: info.idx,
                        refIdx: info.refIdx,
                        setData: setText,
                        updateData: setText,
                    });
                    break;
                case "child":
                    if (info.isOnlyChild) {
                        // tree is the parentnode here
                        ctx.children[info.idx] = {
                            parentRefIdx: info.refIdx,
                            isOnlyChild: true,
                        };
                    }
                    else {
                        // tree is the anchor text node
                        ctx.children[info.idx] = {
                            parentRefIdx: parentTree(tree).refIdx,
                            afterRefIdx: info.refIdx,
                        };
                    }
                    break;
                case "attribute": {
                    const refIdx = info.refIdx;
                    let updater;
                    let setter;
                    if (isProp(info.tag, info.name)) {
                        const setProp = makePropSetter(info.name);
                        setter = setProp;
                        updater = setProp;
                    }
                    else if (info.name === "class") {
                        setter = setClass;
                        updater = updateClass;
                    }
                    else {
                        setter = createAttrUpdater(info.name);
                        updater = setter;
                    }
                    ctx.locations.push({
                        idx: info.idx,
                        refIdx,
                        setData: setter,
                        updateData: updater,
                    });
                    break;
                }
                case "attributes":
                    ctx.locations.push({
                        idx: info.idx,
                        refIdx: info.refIdx,
                        setData: attrsSetter,
                        updateData: attrsUpdater,
                    });
                    break;
                case "handler": {
                    const { setup, update } = createEventHandler(info.event);
                    ctx.locations.push({
                        idx: info.idx,
                        refIdx: info.refIdx,
                        setData: setup,
                        updateData: update,
                    });
                    break;
                }
                case "ref":
                    ctx.cbRefs.push(info.idx);
                    ctx.locations.push({
                        idx: info.idx,
                        refIdx: info.refIdx,
                        setData: setRef,
                        updateData: NO_OP$1,
                    });
            }
        }
    }
    // -----------------------------------------------------------------------------
    // building the concrete block class
    // -----------------------------------------------------------------------------
    function buildBlock(template, ctx) {
        let B = createBlockClass(template, ctx);
        if (ctx.cbRefs.length) {
            const refs = ctx.cbRefs;
            B = class extends B {
                remove() {
                    super.remove();
                    for (let ref of refs) {
                        let fn = this.data[ref];
                        fn(null);
                    }
                }
            };
        }
        if (ctx.children.length) {
            B = class extends B {
                constructor(data, children) {
                    super(data);
                    this.children = children;
                }
            };
            B.prototype.beforeRemove = VMulti.prototype.beforeRemove;
            return (data, children = []) => new B(data, children);
        }
        return (data) => new B(data);
    }
    function createBlockClass(template, ctx) {
        const { refN, collectors, children } = ctx;
        const colN = collectors.length;
        ctx.locations.sort((a, b) => a.idx - b.idx);
        const locations = ctx.locations.map((loc) => ({
            refIdx: loc.refIdx,
            setData: loc.setData,
            updateData: loc.updateData,
        }));
        const locN = locations.length;
        const childN = children.length;
        const childrenLocs = children;
        const isDynamic = refN > 0;
        // these values are defined here to make them faster to lookup in the class
        // block scope
        const nodeCloneNode = nodeProto$2.cloneNode;
        const nodeInsertBefore = nodeProto$2.insertBefore;
        const elementRemove = elementProto.remove;
        return class Block {
            constructor(data) {
                this.data = data;
            }
            beforeRemove() { }
            remove() {
                elementRemove.call(this.el);
            }
            firstNode() {
                return this.el;
            }
            moveBefore(other, afterNode) {
                const target = other ? other.el : afterNode;
                nodeInsertBefore.call(this.parentEl, this.el, target);
            }
            mount(parent, afterNode) {
                const el = nodeCloneNode.call(template, true);
                nodeInsertBefore.call(parent, el, afterNode);
                if (isDynamic) {
                    // collecting references
                    const refs = new Array(refN);
                    this.refs = refs;
                    refs[0] = el;
                    for (let i = 0; i < colN; i++) {
                        const w = collectors[i];
                        refs[w.idx] = w.getVal.call(refs[w.prevIdx]);
                    }
                    // applying data to all update points
                    if (locN) {
                        const data = this.data;
                        for (let i = 0; i < locN; i++) {
                            const loc = locations[i];
                            loc.setData.call(refs[loc.refIdx], data[i]);
                        }
                    }
                    // preparing all children
                    if (childN) {
                        const children = this.children;
                        for (let i = 0; i < childN; i++) {
                            const child = children[i];
                            if (child) {
                                const loc = childrenLocs[i];
                                const afterNode = loc.afterRefIdx ? refs[loc.afterRefIdx] : null;
                                child.isOnlyChild = loc.isOnlyChild;
                                child.mount(refs[loc.parentRefIdx], afterNode);
                            }
                        }
                    }
                }
                this.el = el;
                this.parentEl = parent;
            }
            patch(other, withBeforeRemove) {
                if (this === other) {
                    return;
                }
                const refs = this.refs;
                // update texts/attributes/
                if (locN) {
                    const data1 = this.data;
                    const data2 = other.data;
                    for (let i = 0; i < locN; i++) {
                        const val1 = data1[i];
                        const val2 = data2[i];
                        if (val1 !== val2) {
                            const loc = locations[i];
                            loc.updateData.call(refs[loc.refIdx], val2, val1);
                        }
                    }
                    this.data = data2;
                }
                // update children
                if (childN) {
                    let children1 = this.children;
                    const children2 = other.children;
                    for (let i = 0; i < childN; i++) {
                        const child1 = children1[i];
                        const child2 = children2[i];
                        if (child1) {
                            if (child2) {
                                child1.patch(child2, withBeforeRemove);
                            }
                            else {
                                if (withBeforeRemove) {
                                    child1.beforeRemove();
                                }
                                child1.remove();
                                children1[i] = undefined;
                            }
                        }
                        else if (child2) {
                            const loc = childrenLocs[i];
                            const afterNode = loc.afterRefIdx ? refs[loc.afterRefIdx] : null;
                            child2.mount(refs[loc.parentRefIdx], afterNode);
                            children1[i] = child2;
                        }
                    }
                }
            }
            toString() {
                const div = document.createElement("div");
                this.mount(div, null);
                return div.innerHTML;
            }
        };
    }
    function setText(value) {
        characterDataSetData.call(this, toText(value));
    }
    function setRef(fn) {
        fn(this);
    }

    const getDescriptor = (o, p) => Object.getOwnPropertyDescriptor(o, p);
    const nodeProto$1 = Node.prototype;
    const nodeInsertBefore$1 = nodeProto$1.insertBefore;
    const nodeAppendChild = nodeProto$1.appendChild;
    const nodeRemoveChild$1 = nodeProto$1.removeChild;
    const nodeSetTextContent = getDescriptor(nodeProto$1, "textContent").set;
    // -----------------------------------------------------------------------------
    // List Node
    // -----------------------------------------------------------------------------
    class VList {
        constructor(children) {
            this.children = children;
        }
        mount(parent, afterNode) {
            const children = this.children;
            const _anchor = document.createTextNode("");
            this.anchor = _anchor;
            nodeInsertBefore$1.call(parent, _anchor, afterNode);
            const l = children.length;
            if (l) {
                const mount = children[0].mount;
                for (let i = 0; i < l; i++) {
                    mount.call(children[i], parent, _anchor);
                }
            }
            this.parentEl = parent;
        }
        moveBefore(other, afterNode) {
            if (other) {
                const next = other.children[0];
                afterNode = (next ? next.firstNode() : other.anchor) || null;
            }
            const children = this.children;
            for (let i = 0, l = children.length; i < l; i++) {
                children[i].moveBefore(null, afterNode);
            }
            this.parentEl.insertBefore(this.anchor, afterNode);
        }
        patch(other, withBeforeRemove) {
            if (this === other) {
                return;
            }
            const ch1 = this.children;
            const ch2 = other.children;
            if (ch2.length === 0 && ch1.length === 0) {
                return;
            }
            this.children = ch2;
            const proto = ch2[0] || ch1[0];
            const { mount: cMount, patch: cPatch, remove: cRemove, beforeRemove, moveBefore: cMoveBefore, firstNode: cFirstNode, } = proto;
            const _anchor = this.anchor;
            const isOnlyChild = this.isOnlyChild;
            const parent = this.parentEl;
            // fast path: no new child => only remove
            if (ch2.length === 0 && isOnlyChild) {
                if (withBeforeRemove) {
                    for (let i = 0, l = ch1.length; i < l; i++) {
                        beforeRemove.call(ch1[i]);
                    }
                }
                nodeSetTextContent.call(parent, "");
                nodeAppendChild.call(parent, _anchor);
                return;
            }
            let startIdx1 = 0;
            let startIdx2 = 0;
            let startVn1 = ch1[0];
            let startVn2 = ch2[0];
            let endIdx1 = ch1.length - 1;
            let endIdx2 = ch2.length - 1;
            let endVn1 = ch1[endIdx1];
            let endVn2 = ch2[endIdx2];
            let mapping = undefined;
            // let noFullRemove = this.hasNoComponent;
            while (startIdx1 <= endIdx1 && startIdx2 <= endIdx2) {
                // -------------------------------------------------------------------
                if (startVn1 === null) {
                    startVn1 = ch1[++startIdx1];
                    continue;
                }
                // -------------------------------------------------------------------
                if (endVn1 === null) {
                    endVn1 = ch1[--endIdx1];
                    continue;
                }
                // -------------------------------------------------------------------
                let startKey1 = startVn1.key;
                let startKey2 = startVn2.key;
                if (startKey1 === startKey2) {
                    cPatch.call(startVn1, startVn2, withBeforeRemove);
                    ch2[startIdx2] = startVn1;
                    startVn1 = ch1[++startIdx1];
                    startVn2 = ch2[++startIdx2];
                    continue;
                }
                // -------------------------------------------------------------------
                let endKey1 = endVn1.key;
                let endKey2 = endVn2.key;
                if (endKey1 === endKey2) {
                    cPatch.call(endVn1, endVn2, withBeforeRemove);
                    ch2[endIdx2] = endVn1;
                    endVn1 = ch1[--endIdx1];
                    endVn2 = ch2[--endIdx2];
                    continue;
                }
                // -------------------------------------------------------------------
                if (startKey1 === endKey2) {
                    // bnode moved right
                    cPatch.call(startVn1, endVn2, withBeforeRemove);
                    ch2[endIdx2] = startVn1;
                    const nextChild = ch2[endIdx2 + 1];
                    cMoveBefore.call(startVn1, nextChild, _anchor);
                    startVn1 = ch1[++startIdx1];
                    endVn2 = ch2[--endIdx2];
                    continue;
                }
                // -------------------------------------------------------------------
                if (endKey1 === startKey2) {
                    // bnode moved left
                    cPatch.call(endVn1, startVn2, withBeforeRemove);
                    ch2[startIdx2] = endVn1;
                    const nextChild = ch1[startIdx1];
                    cMoveBefore.call(endVn1, nextChild, _anchor);
                    endVn1 = ch1[--endIdx1];
                    startVn2 = ch2[++startIdx2];
                    continue;
                }
                // -------------------------------------------------------------------
                mapping = mapping || createMapping(ch1, startIdx1, endIdx1);
                let idxInOld = mapping[startKey2];
                if (idxInOld === undefined) {
                    cMount.call(startVn2, parent, cFirstNode.call(startVn1) || null);
                }
                else {
                    const elmToMove = ch1[idxInOld];
                    cMoveBefore.call(elmToMove, startVn1, null);
                    cPatch.call(elmToMove, startVn2, withBeforeRemove);
                    ch2[startIdx2] = elmToMove;
                    ch1[idxInOld] = null;
                }
                startVn2 = ch2[++startIdx2];
            }
            // ---------------------------------------------------------------------
            if (startIdx1 <= endIdx1 || startIdx2 <= endIdx2) {
                if (startIdx1 > endIdx1) {
                    const nextChild = ch2[endIdx2 + 1];
                    const anchor = nextChild ? cFirstNode.call(nextChild) || null : _anchor;
                    for (let i = startIdx2; i <= endIdx2; i++) {
                        cMount.call(ch2[i], parent, anchor);
                    }
                }
                else {
                    for (let i = startIdx1; i <= endIdx1; i++) {
                        let ch = ch1[i];
                        if (ch) {
                            if (withBeforeRemove) {
                                beforeRemove.call(ch);
                            }
                            cRemove.call(ch);
                        }
                    }
                }
            }
        }
        beforeRemove() {
            const children = this.children;
            const l = children.length;
            if (l) {
                const beforeRemove = children[0].beforeRemove;
                for (let i = 0; i < l; i++) {
                    beforeRemove.call(children[i]);
                }
            }
        }
        remove() {
            const { parentEl, anchor } = this;
            if (this.isOnlyChild) {
                nodeSetTextContent.call(parentEl, "");
            }
            else {
                const children = this.children;
                const l = children.length;
                if (l) {
                    const remove = children[0].remove;
                    for (let i = 0; i < l; i++) {
                        remove.call(children[i]);
                    }
                }
                nodeRemoveChild$1.call(parentEl, anchor);
            }
        }
        firstNode() {
            const child = this.children[0];
            return child ? child.firstNode() : undefined;
        }
        toString() {
            return this.children.map((c) => c.toString()).join("");
        }
    }
    function list(children) {
        return new VList(children);
    }
    function createMapping(ch1, startIdx1, endIdx2) {
        let mapping = {};
        for (let i = startIdx1; i <= endIdx2; i++) {
            mapping[ch1[i].key] = i;
        }
        return mapping;
    }

    const nodeProto = Node.prototype;
    const nodeInsertBefore = nodeProto.insertBefore;
    const nodeRemoveChild = nodeProto.removeChild;
    class VHtml {
        constructor(html) {
            this.content = [];
            this.html = html;
        }
        mount(parent, afterNode) {
            this.parentEl = parent;
            const template = document.createElement("template");
            template.innerHTML = this.html;
            this.content = [...template.content.childNodes];
            for (let elem of this.content) {
                nodeInsertBefore.call(parent, elem, afterNode);
            }
            if (!this.content.length) {
                const textNode = document.createTextNode("");
                this.content.push(textNode);
                nodeInsertBefore.call(parent, textNode, afterNode);
            }
        }
        moveBefore(other, afterNode) {
            const target = other ? other.content[0] : afterNode;
            const parent = this.parentEl;
            for (let elem of this.content) {
                nodeInsertBefore.call(parent, elem, target);
            }
        }
        patch(other) {
            if (this === other) {
                return;
            }
            const html2 = other.html;
            if (this.html !== html2) {
                const parent = this.parentEl;
                // insert new html in front of current
                const afterNode = this.content[0];
                const template = document.createElement("template");
                template.innerHTML = html2;
                const content = [...template.content.childNodes];
                for (let elem of content) {
                    nodeInsertBefore.call(parent, elem, afterNode);
                }
                if (!content.length) {
                    const textNode = document.createTextNode("");
                    content.push(textNode);
                    nodeInsertBefore.call(parent, textNode, afterNode);
                }
                // remove current content
                this.remove();
                this.content = content;
            }
        }
        beforeRemove() { }
        remove() {
            const parent = this.parentEl;
            for (let elem of this.content) {
                nodeRemoveChild.call(parent, elem);
            }
        }
        firstNode() {
            return this.content[0];
        }
        toString() {
            return this.html;
        }
    }
    function html(str) {
        return new VHtml(str);
    }

    function mount$1(vnode, fixture, afterNode = null) {
        vnode.mount(fixture, afterNode);
    }
    function patch(vnode1, vnode2, withBeforeRemove = false) {
        vnode1.patch(vnode2, withBeforeRemove);
    }
    function remove(vnode, withBeforeRemove = false) {
        if (withBeforeRemove) {
            vnode.beforeRemove();
        }
        vnode.remove();
    }

    const mainEventHandler = (data, ev, currentTarget) => {
        const { data: _data, modifiers } = filterOutModifiersFromData(data);
        data = _data;
        let stopped = false;
        if (modifiers.length) {
            let selfMode = false;
            const isSelf = ev.target === currentTarget;
            for (const mod of modifiers) {
                switch (mod) {
                    case "self":
                        selfMode = true;
                        if (isSelf) {
                            continue;
                        }
                        else {
                            return stopped;
                        }
                    case "prevent":
                        if ((selfMode && isSelf) || !selfMode)
                            ev.preventDefault();
                        continue;
                    case "stop":
                        if ((selfMode && isSelf) || !selfMode)
                            ev.stopPropagation();
                        stopped = true;
                        continue;
                }
            }
        }
        // If handler is empty, the array slot 0 will also be empty, and data will not have the property 0
        // We check this rather than data[0] being truthy (or typeof function) so that it crashes
        // as expected when there is a handler expression that evaluates to a falsy value
        if (Object.hasOwnProperty.call(data, 0)) {
            data[0].call(data[1] ? data[1].__owl__.component : null, ev);
        }
        return stopped;
    };

    // Maps fibers to thrown errors
    const fibersInError = new WeakMap();
    const nodeErrorHandlers = new WeakMap();
    function _handleError(node, error, isFirstRound = false) {
        if (!node) {
            return false;
        }
        const fiber = node.fiber;
        if (fiber) {
            fibersInError.set(fiber, error);
        }
        const errorHandlers = nodeErrorHandlers.get(node);
        if (errorHandlers) {
            if (isFirstRound && fiber) {
                fiber.root.counter--;
            }
            let propagate = true;
            for (const h of errorHandlers) {
                try {
                    h(error);
                    propagate = false;
                }
                catch (e) {
                    error = e;
                }
            }
            if (propagate) {
                return _handleError(node.parent, error);
            }
            return true;
        }
        else {
            return _handleError(node.parent, error);
        }
    }
    function handleError(params) {
        const error = params.error;
        const node = "node" in params ? params.node : params.fiber.node;
        const fiber = "fiber" in params ? params.fiber : node.fiber;
        fibersInError.set(fiber.root, error);
        const handled = _handleError(node, error, true);
        if (!handled) {
            try {
                node.app.destroy();
            }
            catch (e) { }
        }
        return handled;
    }

    function makeChildFiber(node, parent) {
        let current = node.fiber;
        if (current) {
            // current is necessarily a rootfiber here
            let root = parent.root;
            cancelFibers(root, current.children);
            current.children = [];
            current.parent = parent;
            root.counter++;
            current.root = root;
            return current;
        }
        return new Fiber(node, parent);
    }
    function makeRootFiber(node) {
        let current = node.fiber;
        if (current) {
            let root = current.root;
            root.counter -= cancelFibers(root, current.children);
            current.children = [];
            root.counter++;
            current.bdom = null;
            if (fibersInError.has(current)) {
                fibersInError.delete(current);
                fibersInError.delete(root);
            }
            return current;
        }
        const fiber = new RootFiber(node);
        if (node.willPatch.length) {
            fiber.willPatch.push(fiber);
        }
        if (node.patched.length) {
            fiber.patched.push(fiber);
        }
        return fiber;
    }
    /**
     * @returns number of not-yet rendered fibers cancelled
     */
    function cancelFibers(root, fibers) {
        let result = 0;
        for (let fiber of fibers) {
            fiber.node.fiber = null;
            fiber.root = root;
            if (!fiber.bdom) {
                result++;
            }
            result += cancelFibers(root, fiber.children);
        }
        return result;
    }
    class Fiber {
        constructor(node, parent) {
            this.bdom = null;
            this.children = [];
            this.appliedToDom = false;
            this.node = node;
            node.fiber = this;
            this.parent = parent;
            if (parent) {
                const root = parent.root;
                root.counter++;
                this.root = root;
                parent.children.push(this);
            }
            else {
                this.root = this;
            }
        }
    }
    class RootFiber extends Fiber {
        constructor(node) {
            super(node, null);
            this.counter = 1;
            // only add stuff in this if they have registered some hooks
            this.willPatch = [];
            this.patched = [];
            this.mounted = [];
            this.counter = 1;
            this.promise = new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;
            });
        }
        complete() {
            const node = this.node;
            let current = undefined;
            try {
                // Step 1: calling all willPatch lifecycle hooks
                for (current of this.willPatch) {
                    // because of the asynchronous nature of the rendering, some parts of the
                    // UI may have been rendered, then deleted in a followup rendering, and we
                    // do not want to call onWillPatch in that case.
                    let node = current.node;
                    if (node.fiber === current) {
                        const component = node.component;
                        for (let cb of node.willPatch) {
                            cb.call(component);
                        }
                    }
                }
                current = undefined;
                // Step 2: patching the dom
                node.bdom.patch(this.bdom, Object.keys(node.children).length > 0);
                this.appliedToDom = true;
                // Step 3: calling all destroyed hooks
                for (let node of __internal__destroyed) {
                    for (let cb of node.destroyed) {
                        cb();
                    }
                }
                __internal__destroyed.length = 0;
                // Step 4: calling all mounted lifecycle hooks
                let mountedFibers = this.mounted;
                while ((current = mountedFibers.pop())) {
                    current = current;
                    if (current.appliedToDom) {
                        for (let cb of current.node.mounted) {
                            cb();
                        }
                    }
                }
                // Step 5: calling all patched hooks
                let patchedFibers = this.patched;
                while ((current = patchedFibers.pop())) {
                    current = current;
                    if (current.appliedToDom) {
                        for (let cb of current.node.patched) {
                            cb();
                        }
                    }
                }
                // unregistering the fiber
                node.fiber = null;
            }
            catch (e) {
                if (!handleError({ fiber: current || this, error: e })) {
                    this.reject(e);
                }
            }
        }
    }
    let __internal__destroyed = [];
    class MountFiber extends RootFiber {
        constructor(node, target, options = {}) {
            super(node);
            this.target = target;
            this.position = options.position || "last-child";
        }
        complete() {
            let current = this;
            try {
                const node = this.node;
                node.bdom = this.bdom;
                if (this.position === "last-child" || this.target.childNodes.length === 0) {
                    mount$1(node.bdom, this.target);
                }
                else {
                    const firstChild = this.target.childNodes[0];
                    mount$1(node.bdom, this.target, firstChild);
                }
                node.status = 1 /* MOUNTED */;
                this.appliedToDom = true;
                let mountedFibers = this.mounted;
                while ((current = mountedFibers.pop())) {
                    if (current.appliedToDom) {
                        for (let cb of current.node.mounted) {
                            cb();
                        }
                    }
                }
                node.fiber = null;
            }
            catch (e) {
                if (!handleError({ fiber: current, error: e })) {
                    this.reject(e);
                }
            }
        }
    }

    /**
     * Apply default props (only top level).
     *
     * Note that this method does modify in place the props
     */
    function applyDefaultProps(props, ComponentClass) {
        const defaultProps = ComponentClass.defaultProps;
        if (defaultProps) {
            for (let propName in defaultProps) {
                if (props[propName] === undefined) {
                    props[propName] = defaultProps[propName];
                }
            }
        }
    }
    //------------------------------------------------------------------------------
    // Prop validation helper
    //------------------------------------------------------------------------------
    /**
     * Validate the component props (or next props) against the (static) props
     * description.  This is potentially an expensive operation: it may needs to
     * visit recursively the props and all the children to check if they are valid.
     * This is why it is only done in 'dev' mode.
     */
    const validateProps = function (name, props, parent) {
        const ComponentClass = (typeof name !== "string" ? name : parent.constructor.components[name]);
        applyDefaultProps(props, ComponentClass);
        const propsDef = ComponentClass.props;
        if (propsDef instanceof Array) {
            // list of strings (prop names)
            for (const propName of propsDef) {
                if (propName[propName.length - 1] === "?") {
                    // optional prop
                    break;
                }
                if (!(propName in props)) {
                    throw new Error(`Missing props '${propName}' (component '${ComponentClass.name}')`);
                }
            }
            for (let key in props) {
                if (!propsDef.includes(key) && !propsDef.includes(key + "?")) {
                    throw new Error(`Unknown prop '${key}' given to component '${ComponentClass.name}'`);
                }
            }
        }
        else if (propsDef) {
            // propsDef is an object now
            for (let propName in propsDef) {
                if (props[propName] === undefined) {
                    if (propsDef[propName] && !propsDef[propName].optional) {
                        throw new Error(`Missing props '${propName}' (component '${ComponentClass.name}')`);
                    }
                    else {
                        continue;
                    }
                }
                let isValid;
                try {
                    isValid = isValidProp(props[propName], propsDef[propName]);
                }
                catch (e) {
                    e.message = `Invalid prop '${propName}' in component ${ComponentClass.name} (${e.message})`;
                    throw e;
                }
                if (!isValid) {
                    throw new Error(`Invalid Prop '${propName}' in component '${ComponentClass.name}'`);
                }
            }
            for (let propName in props) {
                if (!(propName in propsDef)) {
                    throw new Error(`Unknown prop '${propName}' given to component '${ComponentClass.name}'`);
                }
            }
        }
    };
    /**
     * Check if an invidual prop value matches its (static) prop definition
     */
    function isValidProp(prop, propDef) {
        if (propDef === true) {
            return true;
        }
        if (typeof propDef === "function") {
            // Check if a value is constructed by some Constructor.  Note that there is a
            // slight abuse of language: we want to consider primitive values as well.
            //
            // So, even though 1 is not an instance of Number, we want to consider that
            // it is valid.
            if (typeof prop === "object") {
                return prop instanceof propDef;
            }
            return typeof prop === propDef.name.toLowerCase();
        }
        else if (propDef instanceof Array) {
            // If this code is executed, this means that we want to check if a prop
            // matches at least one of its descriptor.
            let result = false;
            for (let i = 0, iLen = propDef.length; i < iLen; i++) {
                result = result || isValidProp(prop, propDef[i]);
            }
            return result;
        }
        // propsDef is an object
        if (propDef.optional && prop === undefined) {
            return true;
        }
        let result = propDef.type ? isValidProp(prop, propDef.type) : true;
        if (propDef.validate) {
            result = result && propDef.validate(prop);
        }
        if (propDef.type === Array && propDef.element) {
            for (let i = 0, iLen = prop.length; i < iLen; i++) {
                result = result && isValidProp(prop[i], propDef.element);
            }
        }
        if (propDef.type === Object && propDef.shape) {
            const shape = propDef.shape;
            for (let key in shape) {
                result = result && isValidProp(prop[key], shape[key]);
            }
            if (result) {
                for (let propName in prop) {
                    if (!(propName in shape)) {
                        throw new Error(`unknown prop '${propName}'`);
                    }
                }
            }
        }
        return result;
    }

    const globalStylesheets = {};
    function registerSheet(id, css) {
        const sheet = document.createElement("style");
        sheet.innerHTML = processSheet(css);
        globalStylesheets[id] = sheet;
    }
    /**
     * Apply the stylesheets defined by the component. Note that we need to make
     * sure all inherited stylesheets are applied as well, in a reverse order to
     * ensure that <style/> will be applied to the DOM in the order they are
     * included in the document. We then delete the `style` key from the constructor
     * to make sure we do not apply it again.
     */
    function applyStyles(ComponentClass) {
        const toApply = [];
        while (ComponentClass && ComponentClass.style) {
            if (ComponentClass.hasOwnProperty("style")) {
                toApply.push([ComponentClass.style, ComponentClass.name]);
                delete ComponentClass.style;
            }
            ComponentClass = Object.getPrototypeOf(ComponentClass);
        }
        while (toApply.length) {
            const [styleId, componentName] = toApply.pop();
            activateSheet(styleId, componentName);
        }
    }
    function activateSheet(id, name) {
        const sheet = globalStylesheets[id];
        if (!sheet) {
            throw new Error(`Invalid css stylesheet for component '${name}'. Did you forget to use the 'css' tag helper?`);
        }
        sheet.dataset.component = name;
        document.head.appendChild(sheet);
    }
    function processSheet(str) {
        const tokens = str.split(/(\{|\}|;)/).map((s) => s.trim());
        const selectorStack = [];
        const parts = [];
        let rules = [];
        function generateSelector(stackIndex, parentSelector) {
            const parts = [];
            for (const selector of selectorStack[stackIndex]) {
                let part = (parentSelector && parentSelector + " " + selector) || selector;
                if (part.includes("&")) {
                    part = selector.replace(/&/g, parentSelector || "");
                }
                if (stackIndex < selectorStack.length - 1) {
                    part = generateSelector(stackIndex + 1, part);
                }
                parts.push(part);
            }
            return parts.join(", ");
        }
        function generateRules() {
            if (rules.length) {
                parts.push(generateSelector(0) + " {");
                parts.push(...rules);
                parts.push("}");
                rules = [];
            }
        }
        while (tokens.length) {
            let token = tokens.shift();
            if (token === "}") {
                generateRules();
                selectorStack.pop();
            }
            else {
                if (tokens[0] === "{") {
                    generateRules();
                    selectorStack.push(token.split(/\s*,\s*/));
                    tokens.shift();
                }
                if (tokens[0] === ";") {
                    rules.push("  " + token + ";");
                }
            }
        }
        return parts.join("\n");
    }

    function component(name, props, key, ctx, parent) {
        let node = ctx.children[key];
        let isDynamic = typeof name !== "string";
        if (node) {
            if (node.status < 1 /* MOUNTED */) {
                node.destroy();
                node = undefined;
            }
            else if (node.status === 2 /* DESTROYED */) {
                node = undefined;
            }
        }
        if (isDynamic && node && node.component.constructor !== name) {
            node = undefined;
        }
        const parentFiber = ctx.fiber;
        if (node) {
            node.updateAndRender(props, parentFiber);
        }
        else {
            // new component
            let C;
            if (isDynamic) {
                C = name;
            }
            else {
                C = parent.constructor.components[name];
                if (!C) {
                    throw new Error(`Cannot find the definition of component "${name}"`);
                }
            }
            node = new ComponentNode(C, props, ctx.app, ctx);
            ctx.children[key] = node;
            const fiber = makeChildFiber(node, parentFiber);
            node.initiateRender(fiber);
        }
        return node;
    }
    // -----------------------------------------------------------------------------
    //  Component VNode
    // -----------------------------------------------------------------------------
    let currentNode = null;
    function getCurrent() {
        return currentNode;
    }
    class ComponentNode {
        constructor(C, props, app, parent) {
            this.fiber = null;
            this.bdom = null;
            this.status = 0 /* NEW */;
            this.children = Object.create(null);
            this.slots = {};
            this.refs = {};
            this.willStart = [];
            this.willUpdateProps = [];
            this.willUnmount = [];
            this.mounted = [];
            this.willPatch = [];
            this.patched = [];
            this.destroyed = [];
            currentNode = this;
            this.app = app;
            this.parent = parent || null;
            this.level = parent ? parent.level + 1 : 0;
            applyDefaultProps(props, C);
            const env = (parent && parent.childEnv) || app.env;
            this.childEnv = env;
            this.component = new C(props, env, this);
            this.renderFn = app.getTemplate(C.template).bind(this.component, this.component, this);
            if (C.style) {
                applyStyles(C);
            }
            this.component.setup();
        }
        mountComponent(target, options) {
            const fiber = new MountFiber(this, target, options);
            this.app.scheduler.addFiber(fiber);
            this.initiateRender(fiber);
            return fiber.promise.then(() => this.component);
        }
        async initiateRender(fiber) {
            if (this.mounted.length) {
                fiber.root.mounted.push(fiber);
            }
            const component = this.component;
            try {
                await Promise.all(this.willStart.map((f) => f.call(component)));
            }
            catch (e) {
                handleError({ node: this, error: e });
                return;
            }
            if (this.status === 0 /* NEW */ && this.fiber === fiber) {
                this._render(fiber);
            }
        }
        async render() {
            let fiber = this.fiber;
            if (fiber && !fiber.bdom && !fibersInError.has(fiber)) {
                return fiber.root.promise;
            }
            if (!this.bdom && !fiber) {
                // should find a way to return the future mounting promise
                return;
            }
            fiber = makeRootFiber(this);
            this.app.scheduler.addFiber(fiber);
            await Promise.resolve();
            if (this.status === 2 /* DESTROYED */) {
                return;
            }
            if (this.fiber === fiber) {
                this._render(fiber);
            }
            return fiber.root.promise;
        }
        _render(fiber) {
            try {
                fiber.bdom = this.renderFn();
                fiber.root.counter--;
            }
            catch (e) {
                handleError({ node: this, error: e });
            }
        }
        destroy() {
            if (this.status === 1 /* MOUNTED */) {
                callWillUnmount(this);
                this.bdom.remove();
            }
            callDestroyed(this);
            function callWillUnmount(node) {
                const component = node.component;
                for (let cb of node.willUnmount) {
                    cb.call(component);
                }
                for (let child of Object.values(node.children)) {
                    if (child.status === 1 /* MOUNTED */) {
                        callWillUnmount(child);
                    }
                }
            }
            function callDestroyed(node) {
                const component = node.component;
                node.status = 2 /* DESTROYED */;
                for (let child of Object.values(node.children)) {
                    callDestroyed(child);
                }
                for (let cb of node.destroyed) {
                    cb.call(component);
                }
            }
        }
        async updateAndRender(props, parentFiber) {
            // update
            const fiber = makeChildFiber(this, parentFiber);
            if (this.willPatch.length) {
                parentFiber.root.willPatch.push(fiber);
            }
            if (this.patched.length) {
                parentFiber.root.patched.push(fiber);
            }
            const component = this.component;
            applyDefaultProps(props, component.constructor);
            const prom = Promise.all(this.willUpdateProps.map((f) => f.call(component, props)));
            await prom;
            if (fiber !== this.fiber) {
                return;
            }
            this.component.props = props;
            this._render(fiber);
        }
        // ---------------------------------------------------------------------------
        // Block DOM methods
        // ---------------------------------------------------------------------------
        firstNode() {
            const bdom = this.bdom;
            return bdom ? bdom.firstNode() : undefined;
        }
        mount(parent, anchor) {
            const bdom = this.fiber.bdom;
            this.bdom = bdom;
            bdom.mount(parent, anchor);
            this.status = 1 /* MOUNTED */;
            this.fiber.appliedToDom = true;
            this.fiber = null;
        }
        moveBefore(other, afterNode) {
            this.bdom.moveBefore(other ? other.bdom : null, afterNode);
        }
        patch() {
            this.bdom.patch(this.fiber.bdom, false);
            this.fiber.appliedToDom = true;
            this.fiber = null;
        }
        beforeRemove() {
            visitRemovedNodes(this);
        }
        remove() {
            this.bdom.remove();
        }
    }
    function visitRemovedNodes(node) {
        if (node.status === 1 /* MOUNTED */) {
            const component = node.component;
            for (let cb of node.willUnmount) {
                cb.call(component);
            }
        }
        for (let child of Object.values(node.children)) {
            visitRemovedNodes(child);
        }
        node.status = 2 /* DESTROYED */;
        if (node.destroyed.length) {
            __internal__destroyed.push(node);
        }
    }

    // -----------------------------------------------------------------------------
    //  Scheduler
    // -----------------------------------------------------------------------------
    class Scheduler {
        constructor(requestAnimationFrame) {
            this.tasks = new Set();
            this.isRunning = false;
            this.requestAnimationFrame = requestAnimationFrame;
        }
        start() {
            this.isRunning = true;
            this.scheduleTasks();
        }
        stop() {
            this.isRunning = false;
        }
        addFiber(fiber) {
            this.tasks.add(fiber.root);
            if (!this.isRunning) {
                this.start();
            }
        }
        /**
         * Process all current tasks. This only applies to the fibers that are ready.
         * Other tasks are left unchanged.
         */
        flush() {
            this.tasks.forEach((fiber) => {
                if (fiber.root !== fiber) {
                    // this is wrong! should be something like
                    // if (this.tasks.has(fiber.root)) {
                    //   // parent rendering has completed
                    //   fiber.resolve();
                    //   this.tasks.delete(fiber);
                    // }
                    this.tasks.delete(fiber);
                    return;
                }
                const hasError = fibersInError.has(fiber);
                if (hasError && fiber.counter !== 0) {
                    this.tasks.delete(fiber);
                    fiber.reject(fibersInError.get(fiber));
                    return;
                }
                if (fiber.node.status === 2 /* DESTROYED */) {
                    this.tasks.delete(fiber);
                    return;
                }
                if (fiber.counter === 0) {
                    if (!hasError) {
                        fiber.complete();
                        fiber.resolve();
                    }
                    this.tasks.delete(fiber);
                }
            });
            if (this.tasks.size === 0) {
                this.stop();
            }
        }
        scheduleTasks() {
            this.requestAnimationFrame(() => {
                this.flush();
                if (this.isRunning) {
                    this.scheduleTasks();
                }
            });
        }
    }

    /**
     * Owl QWeb Expression Parser
     *
     * Owl needs in various contexts to be able to understand the structure of a
     * string representing a javascript expression.  The usual goal is to be able
     * to rewrite some variables.  For example, if a template has
     *
     *  ```xml
     *  <t t-if="computeSomething({val: state.val})">...</t>
     * ```
     *
     * this needs to be translated in something like this:
     *
     * ```js
     *   if (context["computeSomething"]({val: context["state"].val})) { ... }
     * ```
     *
     * This file contains the implementation of an extremely naive tokenizer/parser
     * and evaluator for javascript expressions.  The supported grammar is basically
     * only expressive enough to understand the shape of objects, of arrays, and
     * various operators.
     */
    //------------------------------------------------------------------------------
    // Misc types, constants and helpers
    //------------------------------------------------------------------------------
    const RESERVED_WORDS = "true,false,NaN,null,undefined,debugger,console,window,in,instanceof,new,function,return,this,eval,void,Math,RegExp,Array,Object,Date".split(",");
    const WORD_REPLACEMENT = Object.assign(Object.create(null), {
        and: "&&",
        or: "||",
        gt: ">",
        gte: ">=",
        lt: "<",
        lte: "<=",
    });
    const STATIC_TOKEN_MAP = Object.assign(Object.create(null), {
        "{": "LEFT_BRACE",
        "}": "RIGHT_BRACE",
        "[": "LEFT_BRACKET",
        "]": "RIGHT_BRACKET",
        ":": "COLON",
        ",": "COMMA",
        "(": "LEFT_PAREN",
        ")": "RIGHT_PAREN",
    });
    // note that the space after typeof is relevant. It makes sure that the formatted
    // expression has a space after typeof
    const OPERATORS = "...,.,===,==,+,!==,!=,!,||,&&,>=,>,<=,<,?,-,*,/,%,typeof ,=>,=,;,in ".split(",");
    let tokenizeString = function (expr) {
        let s = expr[0];
        let start = s;
        if (s !== "'" && s !== '"' && s !== "`") {
            return false;
        }
        let i = 1;
        let cur;
        while (expr[i] && expr[i] !== start) {
            cur = expr[i];
            s += cur;
            if (cur === "\\") {
                i++;
                cur = expr[i];
                if (!cur) {
                    throw new Error("Invalid expression");
                }
                s += cur;
            }
            i++;
        }
        if (expr[i] !== start) {
            throw new Error("Invalid expression");
        }
        s += start;
        if (start === "`") {
            return {
                type: "TEMPLATE_STRING",
                value: s,
                replace(replacer) {
                    return s.replace(/\$\{(.*?)\}/g, (match, group) => {
                        return "${" + replacer(group) + "}";
                    });
                },
            };
        }
        return { type: "VALUE", value: s };
    };
    let tokenizeNumber = function (expr) {
        let s = expr[0];
        if (s && s.match(/[0-9]/)) {
            let i = 1;
            while (expr[i] && expr[i].match(/[0-9]|\./)) {
                s += expr[i];
                i++;
            }
            return { type: "VALUE", value: s };
        }
        else {
            return false;
        }
    };
    let tokenizeSymbol = function (expr) {
        let s = expr[0];
        if (s && s.match(/[a-zA-Z_\$]/)) {
            let i = 1;
            while (expr[i] && expr[i].match(/\w/)) {
                s += expr[i];
                i++;
            }
            if (s in WORD_REPLACEMENT) {
                return { type: "OPERATOR", value: WORD_REPLACEMENT[s], size: s.length };
            }
            return { type: "SYMBOL", value: s };
        }
        else {
            return false;
        }
    };
    const tokenizeStatic = function (expr) {
        const char = expr[0];
        if (char && char in STATIC_TOKEN_MAP) {
            return { type: STATIC_TOKEN_MAP[char], value: char };
        }
        return false;
    };
    const tokenizeOperator = function (expr) {
        for (let op of OPERATORS) {
            if (expr.startsWith(op)) {
                return { type: "OPERATOR", value: op };
            }
        }
        return false;
    };
    const TOKENIZERS = [
        tokenizeString,
        tokenizeNumber,
        tokenizeOperator,
        tokenizeSymbol,
        tokenizeStatic,
    ];
    /**
     * Convert a javascript expression (as a string) into a list of tokens. For
     * example: `tokenize("1 + b")` will return:
     * ```js
     *  [
     *   {type: "VALUE", value: "1"},
     *   {type: "OPERATOR", value: "+"},
     *   {type: "SYMBOL", value: "b"}
     * ]
     * ```
     */
    function tokenize(expr) {
        const result = [];
        let token = true;
        while (token) {
            expr = expr.trim();
            if (expr) {
                for (let tokenizer of TOKENIZERS) {
                    token = tokenizer(expr);
                    if (token) {
                        result.push(token);
                        expr = expr.slice(token.size || token.value.length);
                        break;
                    }
                }
            }
            else {
                token = false;
            }
        }
        if (expr.length) {
            throw new Error(`Tokenizer error: could not tokenize "${expr}"`);
        }
        return result;
    }
    //------------------------------------------------------------------------------
    // Expression "evaluator"
    //------------------------------------------------------------------------------
    const isLeftSeparator = (token) => token && (token.type === "LEFT_BRACE" || token.type === "COMMA");
    const isRightSeparator = (token) => token && (token.type === "RIGHT_BRACE" || token.type === "COMMA");
    /**
     * This is the main function exported by this file. This is the code that will
     * process an expression (given as a string) and returns another expression with
     * proper lookups in the context.
     *
     * Usually, this kind of code would be very simple to do if we had an AST (so,
     * if we had a javascript parser), since then, we would only need to find the
     * variables and replace them.  However, a parser is more complicated, and there
     * are no standard builtin parser API.
     *
     * Since this method is applied to simple javasript expressions, and the work to
     * be done is actually quite simple, we actually can get away with not using a
     * parser, which helps with the code size.
     *
     * Here is the heuristic used by this method to determine if a token is a
     * variable:
     * - by default, all symbols are considered a variable
     * - unless the previous token is a dot (in that case, this is a property: `a.b`)
     * - or if the previous token is a left brace or a comma, and the next token is
     *   a colon (in that case, this is an object key: `{a: b}`)
     *
     * Some specific code is also required to support arrow functions. If we detect
     * the arrow operator, then we add the current (or some previous tokens) token to
     * the list of variables so it does not get replaced by a lookup in the context
     */
    function compileExprToArray(expr) {
        const localVars = new Set();
        const tokens = tokenize(expr);
        let i = 0;
        let stack = []; // to track last opening [ or {
        while (i < tokens.length) {
            let token = tokens[i];
            let prevToken = tokens[i - 1];
            let nextToken = tokens[i + 1];
            let groupType = stack[stack.length - 1];
            switch (token.type) {
                case "LEFT_BRACE":
                case "LEFT_BRACKET":
                    stack.push(token.type);
                    break;
                case "RIGHT_BRACE":
                case "RIGHT_BRACKET":
                    stack.pop();
            }
            let isVar = token.type === "SYMBOL" && !RESERVED_WORDS.includes(token.value);
            if (token.type === "SYMBOL" && !RESERVED_WORDS.includes(token.value)) {
                if (prevToken) {
                    // normalize missing tokens: {a} should be equivalent to {a:a}
                    if (groupType === "LEFT_BRACE" &&
                        isLeftSeparator(prevToken) &&
                        isRightSeparator(nextToken)) {
                        tokens.splice(i + 1, 0, { type: "COLON", value: ":" }, Object.assign({}, token));
                        nextToken = tokens[i + 1];
                    }
                    if (prevToken.type === "OPERATOR" && prevToken.value === ".") {
                        isVar = false;
                    }
                    else if (prevToken.type === "LEFT_BRACE" || prevToken.type === "COMMA") {
                        if (nextToken && nextToken.type === "COLON") {
                            isVar = false;
                        }
                    }
                }
            }
            if (token.type === "TEMPLATE_STRING") {
                token.value = token.replace((expr) => compileExpr(expr));
            }
            if (nextToken && nextToken.type === "OPERATOR" && nextToken.value === "=>") {
                if (token.type === "RIGHT_PAREN") {
                    let j = i - 1;
                    while (j > 0 && tokens[j].type !== "LEFT_PAREN") {
                        if (tokens[j].type === "SYMBOL" && tokens[j].originalValue) {
                            tokens[j].value = tokens[j].originalValue;
                            localVars.add(tokens[j].value); //] = { id: tokens[j].value, expr: tokens[j].value };
                        }
                        j--;
                    }
                }
                else {
                    localVars.add(token.value); //] = { id: token.value, expr: token.value };
                }
            }
            if (isVar) {
                token.varName = token.value;
                if (!localVars.has(token.value)) {
                    token.originalValue = token.value;
                    token.value = `ctx['${token.value}']`;
                }
            }
            i++;
        }
        // Mark all variables that have been used locally.
        // This assumes the expression has only one scope (incorrect but "good enough for now")
        for (const token of tokens) {
            if (token.type === "SYMBOL" && localVars.has(token.value)) {
                token.isLocal = true;
            }
        }
        return tokens;
    }
    function compileExpr(expr) {
        return compileExprToArray(expr)
            .map((t) => t.value)
            .join("");
    }
    const INTERP_REGEXP = /\{\{.*?\}\}/g;
    const INTERP_GROUP_REGEXP = /\{\{.*?\}\}/g;
    function interpolate(s) {
        let matches = s.match(INTERP_REGEXP);
        if (matches && matches[0].length === s.length) {
            return `(${compileExpr(s.slice(2, -2))})`;
        }
        let r = s.replace(INTERP_GROUP_REGEXP, (s) => "${" + compileExpr(s.slice(2, -2)) + "}");
        return "`" + r + "`";
    }

    // using a non-html document so that <inner/outer>HTML serializes as XML instead
    // of HTML (as we will parse it as xml later)
    const xmlDoc = document.implementation.createDocument(null, null, null);
    // -----------------------------------------------------------------------------
    // BlockDescription
    // -----------------------------------------------------------------------------
    class BlockDescription {
        constructor(target, type) {
            this.dynamicTagName = null;
            this.isRoot = false;
            this.hasDynamicChildren = false;
            this.children = [];
            this.data = [];
            this.childNumber = 0;
            this.parentVar = "";
            this.id = BlockDescription.nextBlockId++;
            this.varName = "b" + this.id;
            this.blockName = "block" + this.id;
            this.target = target;
            this.type = type;
        }
        insertData(str) {
            const id = "d" + BlockDescription.nextDataId++;
            this.target.addLine(`let ${id} = ${str};`);
            return this.data.push(id) - 1;
        }
        insert(dom) {
            if (this.currentDom) {
                this.currentDom.appendChild(dom);
            }
            else {
                this.dom = dom;
            }
        }
        generateExpr(expr) {
            if (this.type === "block") {
                const hasChildren = this.children.length;
                let params = this.data.length ? `[${this.data.join(", ")}]` : hasChildren ? "[]" : "";
                if (hasChildren) {
                    params += ", [" + this.children.map((c) => c.varName).join(", ") + "]";
                }
                if (this.dynamicTagName) {
                    return `toggler(${this.dynamicTagName}, ${this.blockName}(${this.dynamicTagName})(${params}))`;
                }
                return `${this.blockName}(${params})`;
            }
            else if (this.type === "list") {
                return `list(c_block${this.id})`;
            }
            return expr;
        }
        asXmlString() {
            // Can't use outerHTML on text/comment nodes
            // append dom to any element and use innerHTML instead
            const t = xmlDoc.createElement("t");
            t.appendChild(this.dom);
            return t.innerHTML;
        }
    }
    BlockDescription.nextBlockId = 1;
    BlockDescription.nextDataId = 1;
    function createContext(parentCtx, params) {
        return Object.assign({
            block: null,
            index: 0,
            forceNewBlock: true,
            translate: parentCtx.translate,
            tKeyExpr: null,
        }, params);
    }
    class CodeTarget {
        constructor(name) {
            this.signature = "";
            this.indentLevel = 0;
            this.loopLevel = 0;
            this.code = [];
            this.hasRoot = false;
            this.hasCache = false;
            this.name = name;
        }
        addLine(line, idx) {
            const prefix = new Array(this.indentLevel + 2).join("  ");
            if (idx === undefined) {
                this.code.push(prefix + line);
            }
            else {
                this.code.splice(idx, 0, prefix + line);
            }
        }
    }
    const TRANSLATABLE_ATTRS = ["label", "title", "placeholder", "alt"];
    const translationRE = /^(\s*)([\s\S]+?)(\s*)$/;
    class CodeGenerator {
        constructor(name, ast, options) {
            this.blocks = [];
            this.nextId = 1;
            this.nextBlockId = 1;
            this.shouldProtectScope = false;
            this.shouldDefineAssign = false;
            this.hasRef = false;
            this.isDebug = false;
            this.functions = [];
            this.target = new CodeTarget("main");
            this.staticCalls = [];
            this.translateFn = options.translateFn || ((s) => s);
            this.translatableAttributes = options.translatableAttributes || TRANSLATABLE_ATTRS;
            this.hasSafeContext = options.hasSafeContext || false;
            this.dev = options.dev || false;
            this.ast = ast;
            this.templateName = name;
        }
        generateCode() {
            const ast = this.ast;
            this.isDebug = ast.type === 12 /* TDebug */;
            BlockDescription.nextBlockId = 1;
            BlockDescription.nextDataId = 1;
            this.compileAST(ast, {
                block: null,
                index: 0,
                forceNewBlock: false,
                isLast: true,
                translate: true,
                tKeyExpr: null,
            });
            let mainCode = this.target.code;
            this.target.code = [];
            this.target.indentLevel = 0;
            // define blocks and utility functions
            this.addLine(`let { text, createBlock, list, multi, html, toggler, component } = bdom;`);
            this.addLine(`let { withDefault, getTemplate, prepareList, withKey, zero, call, callSlot, capture, isBoundary, shallowEqual, setContextValue, toNumber, safeOutput } = helpers;`);
            if (this.shouldDefineAssign) {
                this.addLine(`let assign = Object.assign;`);
            }
            for (let { id, template } of this.staticCalls) {
                this.addLine(`const ${id} = getTemplate(${template});`);
            }
            // define all blocks
            if (this.blocks.length) {
                this.addLine(``);
                for (let block of this.blocks) {
                    if (block.dom) {
                        let xmlString = block.asXmlString();
                        if (block.dynamicTagName) {
                            xmlString = xmlString.replace(/^<\w+/, `<\${tag || '${block.dom.nodeName}'}`);
                            xmlString = xmlString.replace(/\w+>$/, `\${tag || '${block.dom.nodeName}'}>`);
                            this.addLine(`let ${block.blockName} = tag => createBlock(\`${xmlString}\`);`);
                        }
                        else {
                            this.addLine(`let ${block.blockName} = createBlock(\`${xmlString}\`);`);
                        }
                    }
                }
            }
            // define all slots
            for (let fn of this.functions) {
                this.generateFunctions(fn);
            }
            // // generate main code
            this.target.indentLevel = 0;
            this.addLine(``);
            this.addLine(`return function template(ctx, node, key = "") {`);
            if (this.hasRef) {
                this.addLine(`  const refs = ctx.__owl__.refs;`);
            }
            if (this.shouldProtectScope) {
                this.addLine(`  ctx = Object.create(ctx);`);
                this.addLine(`  ctx[isBoundary] = 1`);
            }
            if (this.target.hasCache) {
                this.addLine(`  let cache = ctx.cache || {};`);
                this.addLine(`  let nextCache = ctx.cache = {};`);
            }
            for (let line of mainCode) {
                this.addLine(line);
            }
            if (!this.target.hasRoot) {
                throw new Error("missing root block");
            }
            this.addLine("}");
            const code = this.target.code.join("\n");
            if (this.isDebug) {
                const msg = `[Owl Debug]\n${code}`;
                console.log(msg);
            }
            return code;
        }
        addLine(line) {
            this.target.addLine(line);
        }
        generateId(prefix = "") {
            return `${prefix}${this.nextId++}`;
        }
        generateBlockName() {
            return `block${this.blocks.length + 1}`;
        }
        insertAnchor(block) {
            const tag = `block-child-${block.children.length}`;
            const anchor = xmlDoc.createElement(tag);
            block.insert(anchor);
        }
        createBlock(parentBlock, type, ctx) {
            const hasRoot = this.target.hasRoot;
            const block = new BlockDescription(this.target, type);
            if (!hasRoot && !ctx.preventRoot) {
                this.target.hasRoot = true;
                block.isRoot = true;
            }
            if (parentBlock) {
                parentBlock.children.push(block);
                if (parentBlock.type === "list") {
                    block.parentVar = `c_block${parentBlock.id}`;
                }
            }
            return block;
        }
        insertBlock(expression, block, ctx) {
            let blockExpr = block.generateExpr(expression);
            const tKeyExpr = ctx.tKeyExpr;
            if (block.parentVar) {
                let keyArg = `key${this.target.loopLevel}`;
                if (tKeyExpr) {
                    keyArg = `${tKeyExpr} + ${keyArg}`;
                }
                this.addLine(`${block.parentVar}[${ctx.index}] = withKey(${blockExpr}, ${keyArg});`);
                return;
            }
            if (tKeyExpr) {
                blockExpr = `toggler(${tKeyExpr}, ${blockExpr})`;
            }
            if (block.isRoot && !ctx.preventRoot) {
                this.addLine(`return ${blockExpr};`);
            }
            else {
                this.addLine(`let ${block.varName} = ${blockExpr};`);
            }
        }
        generateFunctions(fn) {
            this.addLine("");
            this.addLine(`const ${fn.name} = ${fn.signature}`);
            if (fn.hasCache) {
                this.addLine(`let cache = ctx.cache || {};`);
                this.addLine(`let nextCache = ctx.cache = {};`);
            }
            for (let line of fn.code) {
                this.addLine(line);
            }
            this.addLine(`}`);
        }
        captureExpression(expr) {
            const tokens = compileExprToArray(expr);
            const mapping = new Map();
            return tokens
                .map((tok) => {
                if (tok.varName && !tok.isLocal) {
                    if (!mapping.has(tok.varName)) {
                        const varId = this.generateId("v");
                        mapping.set(tok.varName, varId);
                        this.addLine(`const ${varId} = ${tok.value};`);
                    }
                    tok.value = mapping.get(tok.varName);
                }
                return tok.value;
            })
                .join("");
        }
        compileAST(ast, ctx) {
            switch (ast.type) {
                case 1 /* Comment */:
                    this.compileComment(ast, ctx);
                    break;
                case 0 /* Text */:
                    this.compileText(ast, ctx);
                    break;
                case 2 /* DomNode */:
                    this.compileTDomNode(ast, ctx);
                    break;
                case 4 /* TEsc */:
                    this.compileTEsc(ast, ctx);
                    break;
                case 8 /* TOut */:
                    this.compileTOut(ast, ctx);
                    break;
                case 5 /* TIf */:
                    this.compileTIf(ast, ctx);
                    break;
                case 9 /* TForEach */:
                    this.compileTForeach(ast, ctx);
                    break;
                case 10 /* TKey */:
                    this.compileTKey(ast, ctx);
                    break;
                case 3 /* Multi */:
                    this.compileMulti(ast, ctx);
                    break;
                case 7 /* TCall */:
                    this.compileTCall(ast, ctx);
                    break;
                case 15 /* TCallBlock */:
                    this.compileTCallBlock(ast, ctx);
                    break;
                case 6 /* TSet */:
                    this.compileTSet(ast, ctx);
                    break;
                case 11 /* TComponent */:
                    this.compileComponent(ast, ctx);
                    break;
                case 12 /* TDebug */:
                    this.compileDebug(ast, ctx);
                    break;
                case 13 /* TLog */:
                    this.compileLog(ast, ctx);
                    break;
                case 14 /* TSlot */:
                    this.compileTSlot(ast, ctx);
                    break;
                case 16 /* TTranslation */:
                    this.compileTTranslation(ast, ctx);
                    break;
            }
        }
        compileDebug(ast, ctx) {
            this.addLine(`debugger;`);
            if (ast.content) {
                this.compileAST(ast.content, ctx);
            }
        }
        compileLog(ast, ctx) {
            this.addLine(`console.log(${compileExpr(ast.expr)});`);
            if (ast.content) {
                this.compileAST(ast.content, ctx);
            }
        }
        compileComment(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            const isNewBlock = !block || forceNewBlock;
            if (isNewBlock) {
                block = this.createBlock(block, "block", ctx);
                this.blocks.push(block);
            }
            const text = xmlDoc.createComment(ast.value);
            block.insert(text);
            if (isNewBlock) {
                this.insertBlock("", block, ctx);
            }
        }
        compileText(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            let value = ast.value;
            if (value && ctx.translate !== false) {
                const match = translationRE.exec(value);
                value = match[1] + this.translateFn(match[2]) + match[3];
            }
            if (!block || forceNewBlock) {
                block = this.createBlock(block, "text", ctx);
                this.insertBlock(`text(\`${value}\`)`, block, Object.assign(Object.assign({}, ctx), { forceNewBlock: forceNewBlock && !block }));
            }
            else {
                const createFn = ast.type === 0 /* Text */ ? xmlDoc.createTextNode : xmlDoc.createComment;
                block.insert(createFn.call(xmlDoc, value));
            }
        }
        generateHandlerCode(rawEvent, handler) {
            const modifiers = rawEvent
                .split(".")
                .slice(1)
                .map((m) => `"${m}"`);
            let modifiersCode = "";
            if (modifiers.length) {
                modifiersCode = `${modifiers.join(",")}, `;
            }
            return `[${modifiersCode}${this.captureExpression(handler)}, ctx]`;
        }
        compileTDomNode(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            const isNewBlock = !block || forceNewBlock || ast.dynamicTag !== null;
            let codeIdx = this.target.code.length;
            if (isNewBlock) {
                if (ast.dynamicTag && ctx.block) {
                    this.insertAnchor(ctx.block);
                }
                block = this.createBlock(block, "block", ctx);
                this.blocks.push(block);
                if (ast.dynamicTag) {
                    const tagExpr = this.generateId("tag");
                    this.addLine(`let ${tagExpr} = ${compileExpr(ast.dynamicTag)};`);
                    block.dynamicTagName = tagExpr;
                }
            }
            // attributes
            const attrs = {};
            if (ast.ns) {
                // specific namespace uri
                attrs["block-ns"] = ast.ns;
            }
            for (let key in ast.attrs) {
                if (key.startsWith("t-attf")) {
                    let expr = interpolate(ast.attrs[key]);
                    const idx = block.insertData(expr);
                    attrs["block-attribute-" + idx] = key.slice(7);
                }
                else if (key.startsWith("t-att")) {
                    let expr = compileExpr(ast.attrs[key]);
                    const idx = block.insertData(expr);
                    if (key === "t-att") {
                        attrs[`block-attributes`] = String(idx);
                    }
                    else {
                        attrs[`block-attribute-${idx}`] = key.slice(6);
                    }
                }
                else if (this.translatableAttributes.includes(key)) {
                    attrs[key] = this.translateFn(ast.attrs[key]);
                }
                else {
                    attrs[key] = ast.attrs[key];
                }
            }
            // event handlers
            for (let ev in ast.on) {
                const name = this.generateHandlerCode(ev, ast.on[ev]);
                const idx = block.insertData(name);
                attrs[`block-handler-${idx}`] = ev;
            }
            // t-ref
            if (ast.ref) {
                this.hasRef = true;
                const isDynamic = INTERP_REGEXP.test(ast.ref);
                if (isDynamic) {
                    const str = ast.ref.replace(INTERP_REGEXP, (expr) => "${" + this.captureExpression(expr.slice(2, -2)) + "}");
                    const idx = block.insertData(`(el) => refs[\`${str}\`] = el`);
                    attrs["block-ref"] = String(idx);
                }
                else {
                    const idx = block.insertData(`(el) => refs[\`${ast.ref}\`] = el`);
                    attrs["block-ref"] = String(idx);
                }
            }
            // t-model
            if (ast.model) {
                const { baseExpr, expr, eventType, shouldNumberize, shouldTrim, targetAttr, specialInitTargetAttr, } = ast.model;
                const baseExpression = compileExpr(baseExpr);
                const id = this.generateId();
                this.addLine(`const bExpr${id} = ${baseExpression};`);
                const expression = compileExpr(expr);
                let idx;
                if (specialInitTargetAttr) {
                    idx = block.insertData(`${baseExpression}[${expression}] === '${attrs[targetAttr]}'`);
                    attrs[`block-attribute-${idx}`] = specialInitTargetAttr;
                }
                else {
                    idx = block.insertData(`${baseExpression}[${expression}]`);
                    attrs[`block-attribute-${idx}`] = targetAttr;
                }
                let valueCode = `ev.target.${targetAttr}`;
                valueCode = shouldTrim ? `${valueCode}.trim()` : valueCode;
                valueCode = shouldNumberize ? `toNumber(${valueCode})` : valueCode;
                const handler = `[(ev) => { bExpr${id}[${expression}] = ${valueCode}; }]`;
                idx = block.insertData(handler);
                attrs[`block-handler-${idx}`] = eventType;
            }
            const dom = xmlDoc.createElement(ast.tag);
            for (const [attr, val] of Object.entries(attrs)) {
                if (!(attr === "class" && val === "")) {
                    dom.setAttribute(attr, val);
                }
            }
            block.insert(dom);
            if (ast.content.length) {
                const initialDom = block.currentDom;
                block.currentDom = dom;
                const children = ast.content;
                for (let i = 0; i < children.length; i++) {
                    const child = ast.content[i];
                    const subCtx = createContext(ctx, {
                        block,
                        index: block.childNumber,
                        forceNewBlock: false,
                        isLast: ctx.isLast && i === children.length - 1,
                    });
                    this.compileAST(child, subCtx);
                }
                block.currentDom = initialDom;
            }
            if (isNewBlock) {
                this.insertBlock(`${block.blockName}(ddd)`, block, ctx);
                // may need to rewrite code!
                if (block.children.length && block.hasDynamicChildren) {
                    const code = this.target.code;
                    const children = block.children.slice();
                    let current = children.shift();
                    for (let i = codeIdx; i < code.length; i++) {
                        if (code[i].trimStart().startsWith(`let ${current.varName}`)) {
                            code[i] = code[i].replace(`let ${current.varName}`, current.varName);
                            current = children.shift();
                            if (!current)
                                break;
                        }
                    }
                    this.target.addLine(`let ${block.children.map((c) => c.varName)};`, codeIdx);
                }
            }
        }
        compileTEsc(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            let expr;
            if (ast.expr === "0") {
                expr = `ctx[zero]`;
            }
            else {
                expr = compileExpr(ast.expr);
                if (ast.defaultValue) {
                    expr = `withDefault(${expr}, \`${ast.defaultValue}\`)`;
                }
            }
            if (!block || forceNewBlock) {
                block = this.createBlock(block, "text", ctx);
                this.insertBlock(`text(${expr})`, block, Object.assign(Object.assign({}, ctx), { forceNewBlock: forceNewBlock && !block }));
            }
            else {
                const idx = block.insertData(expr);
                const text = xmlDoc.createElement(`block-text-${idx}`);
                block.insert(text);
            }
        }
        compileTOut(ast, ctx) {
            let { block } = ctx;
            if (block) {
                this.insertAnchor(block);
            }
            block = this.createBlock(block, "html", ctx);
            let expr = ast.expr === "0" ? "ctx[zero]" : `safeOutput(${compileExpr(ast.expr)})`;
            if (ast.body) {
                const nextId = BlockDescription.nextBlockId;
                const subCtx = createContext(ctx);
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                expr = `withDefault(${expr}, b${nextId})`;
            }
            this.insertBlock(`${expr}`, block, ctx);
        }
        compileTIf(ast, ctx, nextNode) {
            let { block, forceNewBlock, index } = ctx;
            let currentIndex = index;
            const codeIdx = this.target.code.length;
            const isNewBlock = !block || (block.type !== "multi" && forceNewBlock);
            if (block) {
                block.hasDynamicChildren = true;
            }
            if (!block || (block.type !== "multi" && forceNewBlock)) {
                block = this.createBlock(block, "multi", ctx);
            }
            this.addLine(`if (${compileExpr(ast.condition)}) {`);
            this.target.indentLevel++;
            this.insertAnchor(block);
            const subCtx = createContext(ctx, { block, index: currentIndex });
            this.compileAST(ast.content, subCtx);
            this.target.indentLevel--;
            if (ast.tElif) {
                for (let clause of ast.tElif) {
                    this.addLine(`} else if (${compileExpr(clause.condition)}) {`);
                    this.target.indentLevel++;
                    this.insertAnchor(block);
                    const subCtx = createContext(ctx, { block, index: currentIndex });
                    this.compileAST(clause.content, subCtx);
                    this.target.indentLevel--;
                }
            }
            if (ast.tElse) {
                this.addLine(`} else {`);
                this.target.indentLevel++;
                this.insertAnchor(block);
                const subCtx = createContext(ctx, { block, index: currentIndex });
                this.compileAST(ast.tElse, subCtx);
                this.target.indentLevel--;
            }
            this.addLine("}");
            if (isNewBlock) {
                // note: this part is duplicated from end of compiledomnode:
                if (block.children.length) {
                    const code = this.target.code;
                    const children = block.children.slice();
                    let current = children.shift();
                    for (let i = codeIdx; i < code.length; i++) {
                        if (code[i].trimStart().startsWith(`let ${current.varName}`)) {
                            code[i] = code[i].replace(`let ${current.varName}`, current.varName);
                            current = children.shift();
                            if (!current)
                                break;
                        }
                    }
                    this.target.addLine(`let ${block.children.map((c) => c.varName)};`, codeIdx);
                }
                // note: this part is duplicated from end of compilemulti:
                const args = block.children.map((c) => c.varName).join(", ");
                this.insertBlock(`multi([${args}])`, block, ctx);
            }
        }
        compileTForeach(ast, ctx) {
            let { block } = ctx;
            if (block) {
                this.insertAnchor(block);
            }
            block = this.createBlock(block, "list", ctx);
            this.target.loopLevel++;
            const loopVar = `i${this.target.loopLevel}`;
            this.addLine(`ctx = Object.create(ctx);`);
            const vals = `v_block${block.id}`;
            const keys = `k_block${block.id}`;
            const l = `l_block${block.id}`;
            const c = `c_block${block.id}`;
            this.addLine(`const [${keys}, ${vals}, ${l}, ${c}] = prepareList(${compileExpr(ast.collection)});`);
            this.addLine(`for (let ${loopVar} = 0; ${loopVar} < ${l}; ${loopVar}++) {`);
            this.target.indentLevel++;
            this.addLine(`ctx[\`${ast.elem}\`] = ${vals}[${loopVar}];`);
            if (!ast.hasNoFirst) {
                this.addLine(`ctx[\`${ast.elem}_first\`] = ${loopVar} === 0;`);
            }
            if (!ast.hasNoLast) {
                this.addLine(`ctx[\`${ast.elem}_last\`] = ${loopVar} === ${vals}.length - 1;`);
            }
            if (!ast.hasNoIndex) {
                this.addLine(`ctx[\`${ast.elem}_index\`] = ${loopVar};`);
            }
            if (!ast.hasNoValue) {
                this.addLine(`ctx[\`${ast.elem}_value\`] = ${keys}[${loopVar}];`);
            }
            this.addLine(`let key${this.target.loopLevel} = ${ast.key ? compileExpr(ast.key) : loopVar};`);
            let id;
            if (ast.memo) {
                this.target.hasCache = true;
                this.shouldDefineAssign = true;
                id = this.generateId();
                this.addLine(`let memo${id} = ${compileExpr(ast.memo)}`);
                this.addLine(`let vnode${id} = cache[key${this.target.loopLevel}];`);
                this.addLine(`if (vnode${id}) {`);
                this.target.indentLevel++;
                this.addLine(`if (shallowEqual(vnode${id}.memo, memo${id})) {`);
                this.target.indentLevel++;
                this.addLine(`${c}[${loopVar}] = vnode${id};`);
                this.addLine(`nextCache[key${this.target.loopLevel}] = vnode${id};`);
                this.addLine(`continue;`);
                this.target.indentLevel--;
                this.addLine("}");
                this.target.indentLevel--;
                this.addLine("}");
            }
            const subCtx = createContext(ctx, { block, index: loopVar });
            this.compileAST(ast.body, subCtx);
            if (ast.memo) {
                this.addLine(`nextCache[key${this.target.loopLevel}] = assign(${c}[${loopVar}], {memo: memo${id}});`);
            }
            this.target.indentLevel--;
            this.target.loopLevel--;
            this.addLine(`}`);
            if (!ctx.isLast) {
                this.addLine(`ctx = ctx.__proto__;`);
            }
            this.insertBlock("l", block, ctx);
        }
        compileTKey(ast, ctx) {
            const tKeyExpr = this.generateId("tKey_");
            this.addLine(`const ${tKeyExpr} = ${compileExpr(ast.expr)};`);
            ctx = createContext(ctx, {
                tKeyExpr,
                block: ctx.block,
                index: ctx.index,
            });
            this.compileAST(ast.content, ctx);
        }
        compileMulti(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            const isNewBlock = !block || forceNewBlock;
            let codeIdx = this.target.code.length;
            if (isNewBlock) {
                const n = ast.content.filter((c) => c.type !== 6 /* TSet */).length;
                if (n <= 1) {
                    for (let child of ast.content) {
                        this.compileAST(child, ctx);
                    }
                    return;
                }
                block = this.createBlock(block, "multi", ctx);
            }
            let index = 0;
            for (let i = 0, l = ast.content.length; i < l; i++) {
                const child = ast.content[i];
                const isTSet = child.type === 6 /* TSet */;
                const subCtx = createContext(ctx, {
                    block,
                    index,
                    forceNewBlock: !isTSet,
                    preventRoot: ctx.preventRoot,
                    isLast: ctx.isLast && i === l - 1,
                });
                this.compileAST(child, subCtx);
                if (!isTSet) {
                    index++;
                }
            }
            if (isNewBlock) {
                if (block.hasDynamicChildren) {
                    if (block.children.length) {
                        const code = this.target.code;
                        const children = block.children.slice();
                        let current = children.shift();
                        for (let i = codeIdx; i < code.length; i++) {
                            if (code[i].trimStart().startsWith(`let ${current.varName}`)) {
                                code[i] = code[i].replace(`let ${current.varName}`, current.varName);
                                current = children.shift();
                                if (!current)
                                    break;
                            }
                        }
                        this.target.addLine(`let ${block.children.map((c) => c.varName)};`, codeIdx);
                    }
                }
                const args = block.children.map((c) => c.varName).join(", ");
                this.insertBlock(`multi([${args}])`, block, ctx);
            }
        }
        compileTCall(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (ast.body) {
                this.addLine(`ctx = Object.create(ctx);`);
                this.addLine(`ctx[isBoundary] = 1;`);
                const nextId = BlockDescription.nextBlockId;
                const subCtx = createContext(ctx, { preventRoot: true });
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                if (nextId !== BlockDescription.nextBlockId) {
                    this.addLine(`ctx[zero] = b${nextId};`);
                }
            }
            const isDynamic = INTERP_REGEXP.test(ast.name);
            const subTemplate = isDynamic ? interpolate(ast.name) : "`" + ast.name + "`";
            if (block) {
                if (!forceNewBlock) {
                    this.insertAnchor(block);
                }
            }
            const key = `key + \`${this.generateComponentKey()}\``;
            if (isDynamic) {
                const templateVar = this.generateId("template");
                this.addLine(`const ${templateVar} = ${subTemplate};`);
                block = this.createBlock(block, "multi", ctx);
                this.insertBlock(`call(${templateVar}, ctx, node, ${key})`, block, Object.assign(Object.assign({}, ctx), { forceNewBlock: !block }));
            }
            else {
                const id = this.generateId(`callTemplate_`);
                this.staticCalls.push({ id, template: subTemplate });
                block = this.createBlock(block, "multi", ctx);
                this.insertBlock(`${id}.call(this, ctx, node, ${key})`, block, Object.assign(Object.assign({}, ctx), { forceNewBlock: !block }));
            }
            if (ast.body && !ctx.isLast) {
                this.addLine(`ctx = ctx.__proto__;`);
            }
        }
        compileTCallBlock(ast, ctx) {
            let { block, forceNewBlock } = ctx;
            if (block) {
                if (!forceNewBlock) {
                    this.insertAnchor(block);
                }
            }
            block = this.createBlock(block, "multi", ctx);
            this.insertBlock(compileExpr(ast.name), block, Object.assign(Object.assign({}, ctx), { forceNewBlock: !block }));
        }
        compileTSet(ast, ctx) {
            this.shouldProtectScope = true;
            const expr = ast.value ? compileExpr(ast.value || "") : "null";
            if (ast.body) {
                const subCtx = createContext(ctx);
                const nextId = `b${BlockDescription.nextBlockId}`;
                this.compileAST({ type: 3 /* Multi */, content: ast.body }, subCtx);
                const value = ast.value ? (nextId ? `withDefault(${expr}, ${nextId})` : expr) : nextId;
                this.addLine(`ctx[\`${ast.name}\`] = ${value};`);
            }
            else {
                let value;
                if (ast.defaultValue) {
                    if (ast.value) {
                        value = `withDefault(${expr}, \`${ast.defaultValue}\`)`;
                    }
                    else {
                        value = `\`${ast.defaultValue}\``;
                    }
                }
                else {
                    value = expr;
                }
                this.addLine(`setContextValue(ctx, "${ast.name}", ${value});`);
            }
        }
        generateComponentKey() {
            const parts = [this.generateId("__")];
            for (let i = 0; i < this.target.loopLevel; i++) {
                parts.push(`\${key${i + 1}}`);
            }
            return parts.join("__");
        }
        compileComponent(ast, ctx) {
            let { block } = ctx;
            let extraArgs = {};
            // props
            const props = [];
            for (let p in ast.props) {
                props.push(`${p}: ${compileExpr(ast.props[p]) || undefined}`);
            }
            const propStr = `{${props.join(",")}}`;
            let propString = propStr;
            if (ast.dynamicProps) {
                if (!props.length) {
                    propString = `${compileExpr(ast.dynamicProps)}`;
                }
                else {
                    propString = `Object.assign({}, ${compileExpr(ast.dynamicProps)}, ${propStr})`;
                }
            }
            // cmap key
            const key = this.generateComponentKey();
            let expr;
            if (ast.isDynamic) {
                expr = this.generateId("Comp");
                this.addLine(`let ${expr} = ${compileExpr(ast.name)};`);
            }
            else {
                expr = `\`${ast.name}\``;
            }
            if (this.dev) {
                const propVar = this.generateId("props");
                this.addLine(`const ${propVar} = ${propString}`);
                this.addLine(`helpers.validateProps(${expr}, ${propVar}, ctx)`);
                propString = propVar;
            }
            // slots
            const hasSlot = !!Object.keys(ast.slots).length;
            let slotDef;
            if (hasSlot) {
                let ctxStr = "ctx";
                if (this.target.loopLevel || !this.hasSafeContext) {
                    ctxStr = this.generateId("ctx");
                    this.addLine(`const ${ctxStr} = capture(ctx);`);
                }
                let slotStr = [];
                const initialTarget = this.target;
                for (let slotName in ast.slots) {
                    let name = this.generateId("slot");
                    const slot = new CodeTarget(name);
                    slot.signature = "ctx => (node, key) => {";
                    this.functions.push(slot);
                    this.target = slot;
                    const subCtx = createContext(ctx);
                    this.compileAST(ast.slots[slotName], subCtx);
                    if (this.hasRef) {
                        slot.code.unshift(`  const refs = ctx.__owl__.refs`);
                        slotStr.push(`'${slotName}': ${name}(${ctxStr})`);
                    }
                    else {
                        slotStr.push(`'${slotName}': ${name}(${ctxStr})`);
                    }
                }
                this.target = initialTarget;
                slotDef = `{${slotStr.join(", ")}}`;
                extraArgs.slots = slotDef;
            }
            if (block && (ctx.forceNewBlock === false || ctx.tKeyExpr)) {
                // todo: check the forcenewblock condition
                this.insertAnchor(block);
            }
            let keyArg = `key + \`${key}\``;
            if (ctx.tKeyExpr) {
                keyArg = `${ctx.tKeyExpr} + ${keyArg}`;
            }
            const blockArgs = `${expr}, ${propString}, ${keyArg}, node, ctx`;
            let blockExpr = `component(${blockArgs})`;
            if (Object.keys(extraArgs).length) {
                this.shouldDefineAssign = true;
                const content = Object.keys(extraArgs).map((k) => `${k}: ${extraArgs[k]}`);
                blockExpr = `assign(${blockExpr}, {${content.join(", ")}})`;
            }
            if (ast.isDynamic) {
                blockExpr = `toggler(${expr}, ${blockExpr})`;
            }
            block = this.createBlock(block, "multi", ctx);
            this.insertBlock(blockExpr, block, ctx);
        }
        compileTSlot(ast, ctx) {
            let { block } = ctx;
            let blockString;
            let slotName;
            let dynamic = false;
            if (ast.name.match(INTERP_REGEXP)) {
                dynamic = true;
                slotName = interpolate(ast.name);
            }
            else {
                slotName = "'" + ast.name + "'";
            }
            if (ast.defaultContent) {
                let name = this.generateId("defaultSlot");
                const slot = new CodeTarget(name);
                slot.signature = "ctx => {";
                this.functions.push(slot);
                const initialTarget = this.target;
                const subCtx = createContext(ctx);
                this.target = slot;
                this.compileAST(ast.defaultContent, subCtx);
                this.target = initialTarget;
                blockString = `callSlot(ctx, node, key, ${slotName}, ${name}, ${dynamic})`;
            }
            else {
                if (dynamic) {
                    let name = this.generateId("slot");
                    this.addLine(`const ${name} = ${slotName};`);
                    blockString = `toggler(${name}, callSlot(ctx, node, key, ${name}))`;
                }
                else {
                    blockString = `callSlot(ctx, node, key, ${slotName})`;
                }
            }
            if (block) {
                this.insertAnchor(block);
            }
            block = this.createBlock(block, "multi", ctx);
            this.insertBlock(blockString, block, Object.assign(Object.assign({}, ctx), { forceNewBlock: false }));
        }
        compileTTranslation(ast, ctx) {
            if (ast.content) {
                this.compileAST(ast.content, Object.assign({}, ctx, { translate: false }));
            }
        }
    }

    // -----------------------------------------------------------------------------
    // AST Type definition
    // -----------------------------------------------------------------------------
    var ASTType;
    (function (ASTType) {
        ASTType[ASTType["Text"] = 0] = "Text";
        ASTType[ASTType["Comment"] = 1] = "Comment";
        ASTType[ASTType["DomNode"] = 2] = "DomNode";
        ASTType[ASTType["Multi"] = 3] = "Multi";
        ASTType[ASTType["TEsc"] = 4] = "TEsc";
        ASTType[ASTType["TIf"] = 5] = "TIf";
        ASTType[ASTType["TSet"] = 6] = "TSet";
        ASTType[ASTType["TCall"] = 7] = "TCall";
        ASTType[ASTType["TOut"] = 8] = "TOut";
        ASTType[ASTType["TForEach"] = 9] = "TForEach";
        ASTType[ASTType["TKey"] = 10] = "TKey";
        ASTType[ASTType["TComponent"] = 11] = "TComponent";
        ASTType[ASTType["TDebug"] = 12] = "TDebug";
        ASTType[ASTType["TLog"] = 13] = "TLog";
        ASTType[ASTType["TSlot"] = 14] = "TSlot";
        ASTType[ASTType["TCallBlock"] = 15] = "TCallBlock";
        ASTType[ASTType["TTranslation"] = 16] = "TTranslation";
    })(ASTType || (ASTType = {}));
    function parse(xml) {
        const node = xml instanceof Element ? xml : parseXML(`<t>${xml}</t>`).firstChild;
        const ctx = { inPreTag: false, inSVG: false };
        const ast = parseNode(node, ctx);
        if (!ast) {
            return { type: 0 /* Text */, value: "" };
        }
        return ast;
    }
    function parseNode(node, ctx) {
        if (!(node instanceof Element)) {
            return parseTextCommentNode(node, ctx);
        }
        return (parseTDebugLog(node, ctx) ||
            parseTForEach(node, ctx) ||
            parseTIf(node, ctx) ||
            parseTCall(node, ctx) ||
            parseTCallBlock(node) ||
            parseTEscNode(node, ctx) ||
            parseTKey(node, ctx) ||
            parseTTranslation(node, ctx) ||
            parseTSlot(node, ctx) ||
            parseTOutNode(node, ctx) ||
            parseComponent(node, ctx) ||
            parseDOMNode(node, ctx) ||
            parseTSetNode(node, ctx) ||
            parseTNode(node, ctx));
    }
    // -----------------------------------------------------------------------------
    // <t /> tag
    // -----------------------------------------------------------------------------
    function parseTNode(node, ctx) {
        if (node.tagName !== "t") {
            return null;
        }
        const children = [];
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                children.push(ast);
            }
        }
        switch (children.length) {
            case 0:
                return null;
            case 1:
                return children[0];
            default:
                return {
                    type: 3 /* Multi */,
                    content: children,
                };
        }
    }
    // -----------------------------------------------------------------------------
    // Text and Comment Nodes
    // -----------------------------------------------------------------------------
    const lineBreakRE = /[\r\n]/;
    const whitespaceRE = /\s+/g;
    function parseTextCommentNode(node, ctx) {
        if (node.nodeType === Node.TEXT_NODE) {
            let value = node.textContent || "";
            if (!ctx.inPreTag) {
                if (lineBreakRE.test(value) && !value.trim()) {
                    return null;
                }
                value = value.replace(whitespaceRE, " ");
            }
            return { type: 0 /* Text */, value };
        }
        else if (node.nodeType === Node.COMMENT_NODE) {
            return { type: 1 /* Comment */, value: node.textContent || "" };
        }
        return null;
    }
    // -----------------------------------------------------------------------------
    // debugging
    // -----------------------------------------------------------------------------
    function parseTDebugLog(node, ctx) {
        if (node.hasAttribute("t-debug")) {
            node.removeAttribute("t-debug");
            return {
                type: 12 /* TDebug */,
                content: parseNode(node, ctx),
            };
        }
        if (node.hasAttribute("t-log")) {
            const expr = node.getAttribute("t-log");
            node.removeAttribute("t-log");
            return {
                type: 13 /* TLog */,
                expr,
                content: parseNode(node, ctx),
            };
        }
        return null;
    }
    // -----------------------------------------------------------------------------
    // Regular dom node
    // -----------------------------------------------------------------------------
    const hasDotAtTheEnd = /\.[\w_]+\s*$/;
    const hasBracketsAtTheEnd = /\[[^\[]+\]\s*$/;
    function parseDOMNode(node, ctx) {
        const { tagName } = node;
        const dynamicTag = node.getAttribute("t-tag");
        node.removeAttribute("t-tag");
        if (tagName === "t" && !dynamicTag) {
            return null;
        }
        const children = [];
        if (tagName === "pre") {
            ctx.inPreTag = true;
        }
        const shouldAddSVGNS = tagName === "svg" || (tagName === "g" && !ctx.inSVG);
        ctx.inSVG = ctx.inSVG || shouldAddSVGNS;
        const ns = shouldAddSVGNS ? "http://www.w3.org/2000/svg" : null;
        const ref = node.getAttribute("t-ref");
        node.removeAttribute("t-ref");
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                children.push(ast);
            }
        }
        const nodeAttrsNames = node.getAttributeNames();
        const attrs = {};
        const on = {};
        let model = null;
        for (let attr of nodeAttrsNames) {
            const value = node.getAttribute(attr);
            if (attr.startsWith("t-on")) {
                if (attr === "t-on") {
                    throw new Error("Missing event name with t-on directive");
                }
                on[attr.slice(5)] = value;
            }
            else if (attr.startsWith("t-model")) {
                if (!["input", "select", "textarea"].includes(tagName)) {
                    throw new Error("The t-model directive only works with <input>, <textarea> and <select>");
                }
                let baseExpr, expr;
                if (hasDotAtTheEnd.test(value)) {
                    const index = value.lastIndexOf(".");
                    baseExpr = value.slice(0, index);
                    expr = `'${value.slice(index + 1)}'`;
                }
                else if (hasBracketsAtTheEnd.test(value)) {
                    const index = value.lastIndexOf("[");
                    baseExpr = value.slice(0, index);
                    expr = value.slice(index + 1, -1);
                }
                else {
                    throw new Error(`Invalid t-model expression: "${value}" (it should be assignable)`);
                }
                const typeAttr = node.getAttribute("type");
                const isInput = tagName === "input";
                const isSelect = tagName === "select";
                const isTextarea = tagName === "textarea";
                const isCheckboxInput = isInput && typeAttr === "checkbox";
                const isRadioInput = isInput && typeAttr === "radio";
                const isOtherInput = isInput && !isCheckboxInput && !isRadioInput;
                const hasLazyMod = attr.includes(".lazy");
                const hasNumberMod = attr.includes(".number");
                const hasTrimMod = attr.includes(".trim");
                const eventType = isRadioInput ? "click" : isSelect || hasLazyMod ? "change" : "input";
                model = {
                    baseExpr,
                    expr,
                    targetAttr: isCheckboxInput ? "checked" : "value",
                    specialInitTargetAttr: isRadioInput ? "checked" : null,
                    eventType,
                    shouldTrim: hasTrimMod && (isOtherInput || isTextarea),
                    shouldNumberize: hasNumberMod && (isOtherInput || isTextarea),
                };
            }
            else {
                if (attr.startsWith("t-") && !attr.startsWith("t-att")) {
                    throw new Error(`Unknown QWeb directive: '${attr}'`);
                }
                attrs[attr] = value;
            }
        }
        if (children.length === 1 && children[0].type === 9 /* TForEach */) {
            children[0].isOnlyChild = true;
        }
        return {
            type: 2 /* DomNode */,
            tag: tagName,
            dynamicTag,
            attrs,
            on,
            ref,
            content: children,
            model,
            ns,
        };
    }
    // -----------------------------------------------------------------------------
    // t-esc
    // -----------------------------------------------------------------------------
    function parseTEscNode(node, ctx) {
        if (!node.hasAttribute("t-esc")) {
            return null;
        }
        const escValue = node.getAttribute("t-esc");
        node.removeAttribute("t-esc");
        const tesc = {
            type: 4 /* TEsc */,
            expr: escValue,
            defaultValue: node.textContent || "",
        };
        let ref = node.getAttribute("t-ref");
        node.removeAttribute("t-ref");
        const ast = parseNode(node, ctx);
        if (!ast) {
            return tesc;
        }
        if (ast.type === 2 /* DomNode */) {
            return Object.assign(Object.assign({}, ast), { ref, content: [tesc] });
        }
        if (ast.type === 11 /* TComponent */) {
            throw new Error("t-esc is not supported on Component nodes");
        }
        return tesc;
    }
    // -----------------------------------------------------------------------------
    // t-out
    // -----------------------------------------------------------------------------
    function parseTOutNode(node, ctx) {
        if (!node.hasAttribute("t-out") && !node.hasAttribute("t-raw")) {
            return null;
        }
        if (node.hasAttribute("t-raw")) {
            console.warn(`t-raw has been deprecated in favor of t-out. If the value to render is not wrapped by the "markup" function, it will be escaped`);
        }
        const expr = (node.getAttribute("t-out") || node.getAttribute("t-raw"));
        node.removeAttribute("t-out");
        node.removeAttribute("t-raw");
        const tOut = { type: 8 /* TOut */, expr, body: null };
        const ref = node.getAttribute("t-ref");
        node.removeAttribute("t-ref");
        const ast = parseNode(node, ctx);
        if (!ast) {
            return tOut;
        }
        if (ast.type === 2 /* DomNode */) {
            tOut.body = ast.content.length ? ast.content : null;
            return Object.assign(Object.assign({}, ast), { ref, content: [tOut] });
        }
        return tOut;
    }
    // -----------------------------------------------------------------------------
    // t-foreach and t-key
    // -----------------------------------------------------------------------------
    function parseTForEach(node, ctx) {
        if (!node.hasAttribute("t-foreach")) {
            return null;
        }
        const html = node.outerHTML;
        const collection = node.getAttribute("t-foreach");
        node.removeAttribute("t-foreach");
        const elem = node.getAttribute("t-as") || "";
        node.removeAttribute("t-as");
        const key = node.getAttribute("t-key");
        if (!key) {
            throw new Error(`"Directive t-foreach should always be used with a t-key!" (expression: t-foreach="${collection}" t-as="${elem}")`);
        }
        node.removeAttribute("t-key");
        const memo = node.getAttribute("t-memo") || "";
        node.removeAttribute("t-memo");
        const body = parseNode(node, ctx);
        if (!body) {
            return null;
        }
        const hasNoTCall = !html.includes("t-call");
        const hasNoFirst = hasNoTCall && !html.includes(`${elem}_first`);
        const hasNoLast = hasNoTCall && !html.includes(`${elem}_last`);
        const hasNoIndex = hasNoTCall && !html.includes(`${elem}_index`);
        const hasNoValue = hasNoTCall && !html.includes(`${elem}_value`);
        return {
            type: 9 /* TForEach */,
            collection,
            elem,
            body,
            memo,
            key,
            isOnlyChild: false,
            hasNoComponent: hasNoComponent(body),
            hasNoFirst,
            hasNoLast,
            hasNoIndex,
            hasNoValue,
        };
    }
    /**
     * @returns true if we are sure the ast does not contain any component
     */
    function hasNoComponent(ast) {
        switch (ast.type) {
            case 11 /* TComponent */:
            case 8 /* TOut */:
            case 7 /* TCall */:
            case 15 /* TCallBlock */:
            case 14 /* TSlot */:
                return false;
            case 6 /* TSet */:
            case 0 /* Text */:
            case 1 /* Comment */:
            case 4 /* TEsc */:
                return true;
            case 10 /* TKey */:
                return hasNoComponent(ast.content);
            case 12 /* TDebug */:
            case 13 /* TLog */:
            case 16 /* TTranslation */:
                return ast.content ? hasNoComponent(ast.content) : true;
            case 9 /* TForEach */:
                return ast.hasNoComponent;
            case 3 /* Multi */:
            case 2 /* DomNode */: {
                for (let elem of ast.content) {
                    if (!hasNoComponent(elem)) {
                        return false;
                    }
                }
                return true;
            }
            case 5 /* TIf */: {
                if (!hasNoComponent(ast.content)) {
                    return false;
                }
                if (ast.tElif) {
                    for (let elem of ast.tElif) {
                        if (!hasNoComponent(elem.content)) {
                            return false;
                        }
                    }
                }
                if (ast.tElse && !hasNoComponent(ast.tElse)) {
                    return false;
                }
                return true;
            }
        }
    }
    function parseTKey(node, ctx) {
        if (!node.hasAttribute("t-key")) {
            return null;
        }
        const key = node.getAttribute("t-key");
        node.removeAttribute("t-key");
        const body = parseNode(node, ctx);
        if (!body) {
            return null;
        }
        return { type: 10 /* TKey */, expr: key, content: body };
    }
    // -----------------------------------------------------------------------------
    // t-call
    // -----------------------------------------------------------------------------
    function parseTCall(node, ctx) {
        if (!node.hasAttribute("t-call")) {
            return null;
        }
        const subTemplate = node.getAttribute("t-call");
        node.removeAttribute("t-call");
        if (node.tagName !== "t") {
            const ast = parseNode(node, ctx);
            const tcall = { type: 7 /* TCall */, name: subTemplate, body: null };
            if (ast && ast.type === 2 /* DomNode */) {
                ast.content = [tcall];
                return ast;
            }
            if (ast && ast.type === 11 /* TComponent */) {
                return Object.assign(Object.assign({}, ast), { slots: { default: tcall } });
            }
        }
        const body = [];
        for (let child of node.childNodes) {
            const ast = parseNode(child, ctx);
            if (ast) {
                body.push(ast);
            }
        }
        return {
            type: 7 /* TCall */,
            name: subTemplate,
            body: body.length ? body : null,
        };
    }
    // -----------------------------------------------------------------------------
    // t-call-block
    // -----------------------------------------------------------------------------
    function parseTCallBlock(node, ctx) {
        if (!node.hasAttribute("t-call-block")) {
            return null;
        }
        const name = node.getAttribute("t-call-block");
        return {
            type: 15 /* TCallBlock */,
            name,
        };
    }
    // -----------------------------------------------------------------------------
    // t-if
    // -----------------------------------------------------------------------------
    function parseTIf(node, ctx) {
        if (!node.hasAttribute("t-if")) {
            return null;
        }
        const condition = node.getAttribute("t-if");
        node.removeAttribute("t-if");
        const content = parseNode(node, ctx);
        if (!content) {
            throw new Error("hmmm");
        }
        let nextElement = node.nextElementSibling;
        // t-elifs
        const tElifs = [];
        while (nextElement && nextElement.hasAttribute("t-elif")) {
            const condition = nextElement.getAttribute("t-elif");
            nextElement.removeAttribute("t-elif");
            const tElif = parseNode(nextElement, ctx);
            const next = nextElement.nextElementSibling;
            nextElement.remove();
            nextElement = next;
            if (tElif) {
                tElifs.push({ condition, content: tElif });
            }
        }
        // t-else
        let tElse = null;
        if (nextElement && nextElement.hasAttribute("t-else")) {
            nextElement.removeAttribute("t-else");
            tElse = parseNode(nextElement, ctx);
            nextElement.remove();
        }
        return {
            type: 5 /* TIf */,
            condition,
            content,
            tElif: tElifs.length ? tElifs : null,
            tElse,
        };
    }
    // -----------------------------------------------------------------------------
    // t-set directive
    // -----------------------------------------------------------------------------
    function parseTSetNode(node, ctx) {
        if (!node.hasAttribute("t-set")) {
            return null;
        }
        const name = node.getAttribute("t-set");
        const value = node.getAttribute("t-value") || null;
        const defaultValue = node.innerHTML === node.textContent ? node.textContent || null : null;
        let body = null;
        if (node.textContent !== node.innerHTML) {
            body = [];
            for (let child of node.childNodes) {
                let childAst = parseNode(child, ctx);
                if (childAst) {
                    body.push(childAst);
                }
            }
        }
        return { type: 6 /* TSet */, name, value, defaultValue, body };
    }
    // -----------------------------------------------------------------------------
    // Components
    // -----------------------------------------------------------------------------
    function parseComponent(node, ctx) {
        let name = node.tagName;
        const firstLetter = name[0];
        let isDynamic = node.hasAttribute("t-component");
        if (isDynamic && name !== "t") {
            throw new Error(`Directive 't-component' can only be used on <t> nodes (used on a <${name}>)`);
        }
        if (!(firstLetter === firstLetter.toUpperCase() || isDynamic)) {
            return null;
        }
        if (isDynamic) {
            name = node.getAttribute("t-component");
            node.removeAttribute("t-component");
        }
        const dynamicProps = node.getAttribute("t-props");
        node.removeAttribute("t-props");
        const props = {};
        for (let name of node.getAttributeNames()) {
            const value = node.getAttribute(name);
            if (name.startsWith("t-on-")) {
                throw new Error("t-on is no longer supported on Component node. Consider passing a callback in props.");
            }
            else {
                props[name] = value;
            }
        }
        const slots = {};
        if (node.hasChildNodes()) {
            const clone = node.cloneNode(true);
            // named slots
            const slotNodes = Array.from(clone.querySelectorAll("[t-set-slot]"));
            for (let slotNode of slotNodes) {
                const name = slotNode.getAttribute("t-set-slot");
                // check if this is defined in a sub component (in which case it should
                // be ignored)
                let el = slotNode.parentElement;
                let isInSubComponent = false;
                while (el !== clone) {
                    if (el.hasAttribute("t-component") || el.tagName[0] === el.tagName[0].toUpperCase()) {
                        isInSubComponent = true;
                        break;
                    }
                    el = el.parentElement;
                }
                if (isInSubComponent) {
                    continue;
                }
                slotNode.removeAttribute("t-set-slot");
                slotNode.remove();
                const slotAst = parseNode(slotNode, ctx);
                if (slotAst) {
                    slots[name] = slotAst;
                }
            }
            // default slot
            const defaultContent = parseChildNodes(clone, ctx);
            if (defaultContent) {
                slots.default = defaultContent;
            }
        }
        return { type: 11 /* TComponent */, name, isDynamic, dynamicProps, props, slots };
    }
    // -----------------------------------------------------------------------------
    // Slots
    // -----------------------------------------------------------------------------
    function parseTSlot(node, ctx) {
        if (!node.hasAttribute("t-slot")) {
            return null;
        }
        return {
            type: 14 /* TSlot */,
            name: node.getAttribute("t-slot"),
            defaultContent: parseChildNodes(node, ctx),
        };
    }
    function parseTTranslation(node, ctx) {
        if (node.getAttribute("t-translation") !== "off") {
            return null;
        }
        node.removeAttribute("t-translation");
        return {
            type: 16 /* TTranslation */,
            content: parseNode(node, ctx),
        };
    }
    // -----------------------------------------------------------------------------
    // helpers
    // -----------------------------------------------------------------------------
    function parseChildNodes(node, ctx) {
        const children = [];
        for (let child of node.childNodes) {
            const childAst = parseNode(child, ctx);
            if (childAst) {
                children.push(childAst);
            }
        }
        switch (children.length) {
            case 0:
                return null;
            case 1:
                return children[0];
            default:
                return { type: 3 /* Multi */, content: children };
        }
    }
    function parseXML(xml) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, "text/xml");
        if (doc.getElementsByTagName("parsererror").length) {
            let msg = "Invalid XML in template.";
            const parsererrorText = doc.getElementsByTagName("parsererror")[0].textContent;
            if (parsererrorText) {
                msg += "\nThe parser has produced the following error message:\n" + parsererrorText;
                const re = /\d+/g;
                const firstMatch = re.exec(parsererrorText);
                if (firstMatch) {
                    const lineNumber = Number(firstMatch[0]);
                    const line = xml.split("\n")[lineNumber - 1];
                    const secondMatch = re.exec(parsererrorText);
                    if (line && secondMatch) {
                        const columnIndex = Number(secondMatch[0]) - 1;
                        if (line[columnIndex]) {
                            msg +=
                                `\nThe error might be located at xml line ${lineNumber} column ${columnIndex}\n` +
                                    `${line}\n${"-".repeat(columnIndex - 1)}^`;
                        }
                    }
                }
            }
            throw new Error(msg);
        }
        let tbranch = doc.querySelectorAll("[t-elif], [t-else]");
        for (let i = 0, ilen = tbranch.length; i < ilen; i++) {
            let node = tbranch[i];
            let prevElem = node.previousElementSibling;
            let pattr = (name) => prevElem.getAttribute(name);
            let nattr = (name) => +!!node.getAttribute(name);
            if (prevElem && (pattr("t-if") || pattr("t-elif"))) {
                if (pattr("t-foreach")) {
                    throw new Error("t-if cannot stay at the same level as t-foreach when using t-elif or t-else");
                }
                if (["t-if", "t-elif", "t-else"].map(nattr).reduce(function (a, b) {
                    return a + b;
                }) > 1) {
                    throw new Error("Only one conditional branching directive is allowed per node");
                }
                // All text (with only spaces) and comment nodes (nodeType 8) between
                // branch nodes are removed
                let textNode;
                while ((textNode = node.previousSibling) !== prevElem) {
                    if (textNode.nodeValue.trim().length && textNode.nodeType !== 8) {
                        throw new Error("text is not allowed between branching directives");
                    }
                    textNode.remove();
                }
            }
            else {
                throw new Error("t-elif and t-else directives must be preceded by a t-if or t-elif directive");
            }
        }
        return doc;
    }

    let nextId = 1;
    function compile(template, options = {}) {
        // parsing
        const ast = parse(template);
        // some work
        const hasSafeContext = template instanceof Node
            ? !(template instanceof Element) || template.querySelector("[t-set], [t-call]") === null
            : !template.includes("t-set") && !template.includes("t-call");
        const name = options.name || `template_${nextId++}`;
        // code generation
        const codeGenerator = new CodeGenerator(name, ast, Object.assign(Object.assign({}, options), { hasSafeContext }));
        const code = codeGenerator.generateCode();
        // template function
        return new Function("bdom, helpers", code);
    }

    class EventBus extends EventTarget {
        trigger(name, payload) {
            this.dispatchEvent(new CustomEvent(name, { detail: payload }));
        }
    }
    function whenReady(fn) {
        return new Promise(function (resolve) {
            if (document.readyState !== "loading") {
                resolve(true);
            }
            else {
                document.addEventListener("DOMContentLoaded", resolve, false);
            }
        }).then(fn || function () { });
    }
    async function loadFile(url) {
        const result = await fetch(url);
        if (!result.ok) {
            throw new Error("Error while fetching xml templates");
        }
        return await result.text();
    }
    /*
     * This class just transports the fact that a string is safe
     * to be injected as HTML. Overriding a JS primitive is quite painful though
     * so we need to redfine toString and valueOf.
     */
    class Markup extends String {
    }
    /*
     * Marks a value as safe, that is, a value that can be injected as HTML directly.
     * It should be used to wrap the value passed to a t-out directive to allow a raw rendering.
     */
    function markup(value) {
        return new Markup(value);
    }

    /**
     * This file contains utility functions that will be injected in each template,
     * to perform various useful tasks in the compiled code.
     */
    function withDefault(value, defaultValue) {
        return value === undefined || value === null || value === false ? defaultValue : value;
    }
    function callSlot(ctx, parent, key, name, defaultSlot, dynamic) {
        const slots = ctx.__owl__.slots;
        const slotFn = slots[name];
        const slotBDom = slotFn ? slotFn(parent, key) : null;
        if (defaultSlot) {
            let child1 = undefined;
            let child2 = undefined;
            if (slotBDom) {
                child1 = dynamic ? toggler(name, slotBDom) : slotBDom;
            }
            else {
                child2 = defaultSlot(parent, key);
            }
            return multi([child1, child2]);
        }
        return slotBDom || text("");
    }
    function capture(ctx) {
        const component = ctx.__owl__.component;
        const result = Object.create(component);
        for (let k in ctx) {
            result[k] = ctx[k];
        }
        return result;
    }
    function withKey(elem, k) {
        elem.key = k;
        return elem;
    }
    function prepareList(collection) {
        let keys;
        let values;
        if (Array.isArray(collection)) {
            keys = collection;
            values = collection;
        }
        else if (collection) {
            values = Object.keys(collection);
            keys = Object.values(collection);
        }
        else {
            throw new Error("Invalid loop expression");
        }
        const n = values.length;
        return [keys, values, n, new Array(n)];
    }
    const isBoundary = Symbol("isBoundary");
    function setContextValue(ctx, key, value) {
        const ctx0 = ctx;
        while (!ctx.hasOwnProperty(key) && !ctx.hasOwnProperty(isBoundary)) {
            const newCtx = ctx.__proto__;
            if (!newCtx) {
                ctx = ctx0;
                break;
            }
            ctx = newCtx;
        }
        ctx[key] = value;
    }
    function toNumber(val) {
        const n = parseFloat(val);
        return isNaN(n) ? val : n;
    }
    function shallowEqual$1(l1, l2) {
        for (let i = 0, l = l1.length; i < l; i++) {
            if (l1[i] !== l2[i]) {
                return false;
            }
        }
        return true;
    }
    /*
     * Safely outputs `value` as a block depending on the nature of `value`
     */
    function safeOutput(value) {
        if (!value) {
            return value;
        }
        let safeKey;
        let block;
        if (value instanceof Markup) {
            safeKey = `string_safe`;
            block = html(value);
        }
        else if (typeof value === "string") {
            safeKey = "string_unsafe";
            block = text(value);
        }
        else {
            // Assuming it is a block
            safeKey = "block_safe";
            block = value;
        }
        return toggler(safeKey, block);
    }
    const UTILS = {
        withDefault,
        zero: Symbol("zero"),
        isBoundary,
        callSlot,
        capture,
        withKey,
        prepareList,
        setContextValue,
        shallowEqual: shallowEqual$1,
        toNumber,
        validateProps,
        safeOutput,
    };

    const bdom = { text, createBlock, list, multi, html, toggler, component };
    const globalTemplates = {};
    class TemplateSet {
        constructor() {
            this.rawTemplates = Object.create(globalTemplates);
            this.templates = {};
            const call = (subTemplate, ctx, parent) => {
                const template = this.getTemplate(subTemplate);
                return toggler(subTemplate, template(ctx, parent));
            };
            const getTemplate = (name) => this.getTemplate(name);
            this.utils = Object.assign({}, UTILS, { getTemplate, call });
        }
        addTemplate(name, template, options = {}) {
            if (name in this.rawTemplates && !options.allowDuplicate) {
                throw new Error(`Template ${name} already defined`);
            }
            this.rawTemplates[name] = template;
        }
        addTemplates(xml, options = {}) {
            xml = xml instanceof Document ? xml : new DOMParser().parseFromString(xml, "text/xml");
            for (const template of xml.querySelectorAll("[t-name]")) {
                const name = template.getAttribute("t-name");
                template.removeAttribute("t-name");
                this.addTemplate(name, template, options);
            }
        }
        getTemplate(name) {
            if (!(name in this.templates)) {
                const rawTemplate = this.rawTemplates[name];
                if (rawTemplate === undefined) {
                    throw new Error(`Missing template: "${name}"`);
                }
                const templateFn = compile(rawTemplate, {
                    name,
                    dev: this.dev,
                    translateFn: this.translateFn,
                    translatableAttributes: this.translatableAttributes,
                });
                // first add a function to lazily get the template, in case there is a
                // recursive call to the template name
                this.templates[name] = (context, parent) => this.templates[name](context, parent);
                const template = templateFn(bdom, this.utils);
                this.templates[name] = template;
            }
            return this.templates[name];
        }
    }

    const DEV_MSG = `Owl is running in 'dev' mode.

This is not suitable for production use.
See https://github.com/odoo/owl/blob/master/doc/reference/config.md#mode for more information.`;
    class App extends TemplateSet {
        constructor(Root, props) {
            super();
            this.env = Object.freeze({});
            this.scheduler = new Scheduler(window.requestAnimationFrame.bind(window));
            this.root = null;
            this.Root = Root;
            this.props = props;
        }
        configure(config) {
            if (config.dev) {
                this.dev = config.dev;
                console.info(DEV_MSG);
            }
            if (config.env) {
                this.env = Object.freeze(Object.assign({}, config.env));
            }
            if (config.translateFn) {
                this.translateFn = config.translateFn;
            }
            if (config.translatableAttributes) {
                this.translatableAttributes = config.translatableAttributes;
            }
            return this;
        }
        mount(target, options) {
            if (!(target instanceof HTMLElement)) {
                throw new Error("Cannot mount component: the target is not a valid DOM element");
            }
            if (!document.body.contains(target)) {
                throw new Error("Cannot mount a component on a detached dom node");
            }
            const node = new ComponentNode(this.Root, this.props, this);
            this.root = node;
            return node.mountComponent(target, options);
        }
        destroy() {
            if (this.root) {
                this.root.destroy();
            }
        }
    }

    // -----------------------------------------------------------------------------
    //  Component Class
    // -----------------------------------------------------------------------------
    class Component {
        constructor(props, env, node) {
            this.props = props;
            this.env = env;
            this.__owl__ = node;
        }
        get el() {
            const node = this.__owl__;
            return node.bdom ? node.bdom.firstNode() : undefined;
        }
        setup() { }
        render() {
            return this.__owl__.render();
        }
    }
    Component.template = "";
    Component.style = "";

    // -----------------------------------------------------------------------------
    //  Status
    // -----------------------------------------------------------------------------
    var STATUS;
    (function (STATUS) {
        STATUS[STATUS["NEW"] = 0] = "NEW";
        STATUS[STATUS["MOUNTED"] = 1] = "MOUNTED";
        STATUS[STATUS["DESTROYED"] = 2] = "DESTROYED";
    })(STATUS || (STATUS = {}));
    function status(component) {
        switch (component.__owl__.status) {
            case 0 /* NEW */:
                return "new";
            case 1 /* MOUNTED */:
                return "mounted";
            case 2 /* DESTROYED */:
                return "destroyed";
        }
    }

    // -----------------------------------------------------------------------------
    //  Global templates
    // -----------------------------------------------------------------------------
    function xml(strings, ...args) {
        const name = `__template__${xml.nextId++}`;
        const value = String.raw(strings, ...args);
        globalTemplates[name] = value;
        return name;
    }
    xml.nextId = 1;
    // -----------------------------------------------------------------------------
    //  Global stylesheets
    // -----------------------------------------------------------------------------
    function css(strings, ...args) {
        const name = `__sheet__${css.nextId++}`;
        const value = String.raw(strings, ...args);
        registerSheet(name, value);
        return name;
    }
    css.nextId = 1;

    const VText = text("").constructor;
    class VPortal extends VText {
        constructor(selector, realBDom) {
            super("");
            this.target = null;
            this.selector = selector;
            this.realBDom = realBDom;
        }
        mount(parent, anchor) {
            super.mount(parent, anchor);
            this.target = document.querySelector(this.selector);
            if (!this.target) {
                let el = this.el;
                while (el && el.parentElement instanceof HTMLElement) {
                    el = el.parentElement;
                }
                this.target = el && el.querySelector(this.selector);
                if (!this.target) {
                    throw new Error("invalid portal target");
                }
            }
            this.realBDom.mount(this.target, null);
        }
        beforeRemove() {
            this.realBDom.beforeRemove();
        }
        remove() {
            super.remove();
            this.realBDom.remove();
            this.realBDom = null;
        }
        patch(other) {
            super.patch(other);
            if (this.realBDom) {
                this.realBDom.patch(other.realBDom, true);
            }
            else {
                this.realBDom = other.realBDom;
                this.realBDom.mount(this.target, null);
            }
        }
    }
    class Portal extends Component {
        constructor(props, env, node) {
            super(props, env, node);
            node._render = function (fiber) {
                const bdom = new VPortal(props.target, this.renderFn());
                fiber.bdom = bdom;
                fiber.root.counter--;
            };
        }
    }
    Portal.template = xml `<t t-slot="default"/>`;
    Portal.props = {
        target: {
            type: String,
        },
    };

    class Memo extends Component {
        constructor(props, env, node) {
            super(props, env, node);
            // prevent patching process conditionally
            let applyPatch = false;
            const patchFn = node.patch;
            node.patch = () => {
                if (applyPatch) {
                    patchFn.call(node);
                    applyPatch = false;
                }
            };
            // check props change, and render/apply patch if it changed
            let prevProps = props;
            const updateAndRender = node.updateAndRender;
            node.updateAndRender = function (props, parentFiber) {
                const shouldUpdate = !shallowEqual(prevProps, props);
                if (shouldUpdate) {
                    prevProps = props;
                    updateAndRender.call(node, props, parentFiber);
                    applyPatch = true;
                }
                return Promise.resolve();
            };
        }
    }
    Memo.template = xml `<t t-slot="default"/>`;
    /**
     * we assume that each object have the same set of keys
     */
    function shallowEqual(p1, p2) {
        for (let k in p1) {
            if (p1[k] !== p2[k]) {
                return false;
            }
        }
        return true;
    }

    // -----------------------------------------------------------------------------
    //  hooks
    // -----------------------------------------------------------------------------
    function onWillStart(fn) {
        const node = getCurrent();
        node.willStart.push(fn);
    }
    function onWillUpdateProps(fn) {
        const node = getCurrent();
        node.willUpdateProps.push(fn);
    }
    function onMounted(fn) {
        const node = getCurrent();
        node.mounted.push(fn);
    }
    function onWillPatch(fn) {
        const node = getCurrent();
        node.willPatch.unshift(fn);
    }
    function onPatched(fn) {
        const node = getCurrent();
        node.patched.push(fn);
    }
    function onWillUnmount(fn) {
        const node = getCurrent();
        node.willUnmount.unshift(fn);
    }
    function onDestroyed(fn) {
        const node = getCurrent();
        node.destroyed.push(fn);
    }
    function onWillRender(fn) {
        const node = getCurrent();
        const renderFn = node.renderFn;
        node.renderFn = () => {
            fn();
            return renderFn();
        };
    }
    function onRendered(fn) {
        const node = getCurrent();
        const renderFn = node.renderFn;
        node.renderFn = () => {
            const result = renderFn();
            fn();
            return result;
        };
    }
    function onError(fn) {
        const node = getCurrent();
        let handlers = nodeErrorHandlers.get(node);
        if (handlers) {
            handlers.push(fn);
        }
        else {
            handlers = [];
            handlers.push(fn);
            nodeErrorHandlers.set(node, handlers);
        }
    }

    // Allows to get the target of a Reactive (used for making a new Reactive from the underlying object)
    const TARGET = Symbol("Target");
    // Special key to subscribe to, to be notified of key creation/deletion
    const KEYCHANGES = Symbol("Key changes");
    /**
     * Checks whether a given value can be made into a reactive object.
     *
     * @param value the value to check
     * @returns whether the value can be made reactive
     */
    function canBeMadeReactive(value) {
        return (typeof value === "object" &&
            value !== null &&
            !(value instanceof Date) &&
            !(value instanceof Promise) &&
            !(value instanceof String) &&
            !(value instanceof Number));
    }
    const targetToKeysToCallbacks = new WeakMap();
    /**
     * Observes a given key on a target with an callback. The callback will be
     * called when the given key changes on the target.
     *
     * @param target the target whose key should be observed
     * @param key the key to observe (or Symbol(KEYCHANGES) for key creation
     *  or deletion)
     * @param callback the function to call when the key changes
     */
    function observeTargetKey(target, key, callback) {
        if (!targetToKeysToCallbacks.get(target)) {
            targetToKeysToCallbacks.set(target, new Map());
        }
        const keyToCallbacks = targetToKeysToCallbacks.get(target);
        if (!keyToCallbacks.get(key)) {
            keyToCallbacks.set(key, new Set());
        }
        keyToCallbacks.get(key).add(callback);
    }
    /**
     * Notify Reactives that are observing a given target that a key has changed on
     * the target.
     *
     * @param target target whose Reactives should be notified that the target was
     *  changed.
     * @param key the key that changed (or Symbol `KEYCHANGES` if a key was created
     *   or deleted)
     */
    function notifyReactives(target, key) {
        const keyToCallbacks = targetToKeysToCallbacks.get(target);
        if (!keyToCallbacks) {
            return;
        }
        const callbacks = keyToCallbacks.get(key);
        if (!callbacks) {
            return;
        }
        // Loop on copy because clearReactivesForCallback will modify the set in place
        for (const callback of [...callbacks]) {
            clearReactivesForCallback(callback);
            callback();
        }
    }
    const callbacksToTargets = new WeakMap();
    /**
     * Clears all subscriptions of the Reactives associated with a given callback.
     *
     * @param callback the callback for which the reactives need to be cleared
     */
    function clearReactivesForCallback(callback) {
        const targetsToClear = callbacksToTargets.get(callback);
        if (!targetsToClear) {
            return;
        }
        for (const target of targetsToClear) {
            const observedKeys = targetToKeysToCallbacks.get(target);
            if (!observedKeys) {
                continue;
            }
            for (const callbacks of observedKeys.values()) {
                callbacks.delete(callback);
            }
        }
    }
    const reactiveCache = new WeakMap();
    /**
     * Creates a reactive proxy for an object. Reading data on the reactive object
     * subscribes to changes to the data. Writing data on the object will cause the
     * notify callback to be called if there are suscriptions to that data. Nested
     * objects and arrays are automatically made reactive as well.
     *
     * Whenever you are notified of a change, all subscriptions are cleared, and if
     * you would like to be notified of any further changes, you should go read
     * the underlying data again. We assume that if you don't go read it again after
     * being notified, it means that you are no longer interested in that data.
     *
     * Subscriptions:
     * + Reading a property on an object will subscribe you to changes in the value
     *    of that property.
     * + Accessing an object keys (eg with Object.keys or with `for..in`) will
     *    subscribe you to the creation/deletion of keys. Checking the presence of a
     *    key on the object with 'in' has the same effect.
     * - getOwnPropertyDescriptor does not currently subscribe you to the property.
     *    This is a choice that was made because changing a key's value will trigger
     *    this trap and we do not want to subscribe by writes. This also means that
     *    Object.hasOwnProperty doesn't subscribe as it goes through this trap.
     *
     * @param target the object for which to create a reactive proxy
     * @param callback the function to call when an observed property of the
     *  reactive has changed
     * @returns a proxy that tracks changes to it
     */
    function reactive(target, callback) {
        if (!canBeMadeReactive(target)) {
            throw new Error(`Cannot make the given value reactive`);
        }
        const originalTarget = target[TARGET];
        if (originalTarget) {
            return reactive(originalTarget, callback);
        }
        if (!reactiveCache.has(target)) {
            reactiveCache.set(target, new Map());
        }
        const reactivesForTarget = reactiveCache.get(target);
        if (!reactivesForTarget.has(callback)) {
            const proxy = new Proxy(target, {
                get(target, key, proxy) {
                    if (key === TARGET) {
                        return target;
                    }
                    observeTargetKey(target, key, callback);
                    const value = Reflect.get(target, key, proxy);
                    if (!canBeMadeReactive(value)) {
                        return value;
                    }
                    return reactive(value, callback);
                },
                set(target, key, value, proxy) {
                    const isNewKey = !Object.hasOwnProperty.call(target, key);
                    const originalValue = Reflect.get(target, key, proxy);
                    const ret = Reflect.set(target, key, value, proxy);
                    if (isNewKey) {
                        notifyReactives(target, KEYCHANGES);
                    }
                    // While Array length may trigger the set trap, it's not actually set by this
                    // method but is updated behind the scenes, and the trap is not called with the
                    // new value. We disable the "same-value-optimization" for it because of that.
                    if (originalValue !== value || (Array.isArray(target) && key === "length")) {
                        notifyReactives(target, key);
                    }
                    return ret;
                },
                deleteProperty(target, key) {
                    const ret = Reflect.deleteProperty(target, key);
                    notifyReactives(target, KEYCHANGES);
                    notifyReactives(target, key);
                    return ret;
                },
                ownKeys(target) {
                    observeTargetKey(target, KEYCHANGES, callback);
                    return Reflect.ownKeys(target);
                },
                has(target, key) {
                    // TODO: this observes all key changes instead of only the presence of the argument key
                    observeTargetKey(target, KEYCHANGES, callback);
                    return Reflect.has(target, key);
                },
            });
            reactivesForTarget.set(callback, proxy);
            if (!callbacksToTargets.has(callback)) {
                callbacksToTargets.set(callback, new Set());
            }
            callbacksToTargets.get(callback).add(target);
        }
        return reactivesForTarget.get(callback);
    }
    /**
     * Creates a batched version of a callback so that all calls to it in the same
     * microtick will only call the original callback once.
     *
     * @param callback the callback to batch
     * @returns a batched version of the original callback
     */
    function batched(callback) {
        let called = false;
        return async () => {
            // This await blocks all calls to the callback here, then releases them sequentially
            // in the next microtick. This line decides the granularity of the batch.
            await Promise.resolve();
            if (!called) {
                called = true;
                callback();
                // wait for all calls in this microtick to fall through before resetting "called"
                // so that only the first call to the batched function calls the original callback
                await Promise.resolve();
                called = false;
            }
        };
    }
    const batchedRenderFunctions = new WeakMap();
    /**
     * Creates a reactive object that will be observed by the current component.
     * Reading data from the returned object (eg during rendering) will cause the
     * component to subscribe to that data and be rerendered when it changes.
     *
     * @param state the state to observe
     * @returns a reactive object that will cause the component to re-render on
     *  relevant changes
     * @see reactive
     */
    function useState(state) {
        const node = getCurrent();
        if (!batchedRenderFunctions.has(node)) {
            batchedRenderFunctions.set(node, batched(() => node.render()));
        }
        const render = batchedRenderFunctions.get(node);
        const reactiveState = reactive(state, render);
        onWillUnmount(() => clearReactivesForCallback(render));
        return reactiveState;
    }

    // -----------------------------------------------------------------------------
    // useRef
    // -----------------------------------------------------------------------------
    /**
     * The purpose of this hook is to allow components to get a reference to a sub
     * html node or component.
     */
    function useRef(name) {
        const node = getCurrent();
        return {
            get el() {
                return node.refs[name] || null;
            },
        };
    }
    // -----------------------------------------------------------------------------
    // useEnv and useSubEnv
    // -----------------------------------------------------------------------------
    /**
     * This hook is useful as a building block for some customized hooks, that may
     * need a reference to the env of the component calling them.
     */
    function useEnv() {
        return getCurrent().component.env;
    }
    /**
     * This hook is a simple way to let components use a sub environment.  Note that
     * like for all hooks, it is important that this is only called in the
     * constructor method.
     */
    function useSubEnv(envExtension) {
        const node = getCurrent();
        node.childEnv = Object.freeze(Object.assign({}, node.childEnv, envExtension));
    }
    // -----------------------------------------------------------------------------
    // useEffect
    // -----------------------------------------------------------------------------
    const NO_OP = () => { };
    /**
     * This hook will run a callback when a component is mounted and patched, and
     * will run a cleanup function before patching and before unmounting the
     * the component.
     *
     * @param {Effect} effect the effect to run on component mount and/or patch
     * @param {()=>any[]} [computeDependencies=()=>[NaN]] a callback to compute
     *      dependencies that will decide if the effect needs to be cleaned up and
     *      run again. If the dependencies did not change, the effect will not run
     *      again. The default value returns an array containing only NaN because
     *      NaN !== NaN, which will cause the effect to rerun on every patch.
     */
    function useEffect(effect, computeDependencies = () => [NaN]) {
        let cleanup;
        let dependencies;
        onMounted(() => {
            dependencies = computeDependencies();
            cleanup = effect(...dependencies) || NO_OP;
        });
        let shouldReapplyOnPatch = false;
        onWillPatch(() => {
            const newDeps = computeDependencies();
            shouldReapplyOnPatch = newDeps.some((val, i) => val !== dependencies[i]);
            if (shouldReapplyOnPatch) {
                cleanup();
                dependencies = newDeps;
            }
        });
        onPatched(() => {
            if (shouldReapplyOnPatch) {
                cleanup = effect(...dependencies) || NO_OP;
            }
        });
        onWillUnmount(() => cleanup());
    }
    // -----------------------------------------------------------------------------
    // useExternalListener
    // -----------------------------------------------------------------------------
    /**
     * When a component needs to listen to DOM Events on element(s) that are not
     * part of his hierarchy, we can use the `useExternalListener` hook.
     * It will correctly add and remove the event listener, whenever the
     * component is mounted and unmounted.
     *
     * Example:
     *  a menu needs to listen to the click on window to be closed automatically
     *
     * Usage:
     *  in the constructor of the OWL component that needs to be notified,
     *  `useExternalListener(window, 'click', this._doSomething);`
     * */
    function useExternalListener(target, eventName, handler, eventParams) {
        const node = getCurrent();
        const boundHandler = handler.bind(node.component);
        onMounted(() => target.addEventListener(eventName, boundHandler, eventParams));
        onWillUnmount(() => target.removeEventListener(eventName, boundHandler, eventParams));
    }

    config.shouldNormalizeDom = false;
    config.mainEventHandler = mainEventHandler;
    const blockDom = {
        config,
        // bdom entry points
        mount: mount$1,
        patch,
        remove,
        // bdom block types
        list,
        multi,
        text,
        toggler,
        createBlock,
        html,
    };
    async function mount(C, target, config = {}) {
        const app = new App(C);
        return app.configure(config).mount(target);
    }
    function useComponent() {
        const current = getCurrent();
        return current.component;
    }
    const __info__ = {};

    exports.App = App;
    exports.Component = Component;
    exports.EventBus = EventBus;
    exports.Memo = Memo;
    exports.Portal = Portal;
    exports.__info__ = __info__;
    exports.blockDom = blockDom;
    exports.css = css;
    exports.loadFile = loadFile;
    exports.markup = markup;
    exports.mount = mount;
    exports.onDestroyed = onDestroyed;
    exports.onError = onError;
    exports.onMounted = onMounted;
    exports.onPatched = onPatched;
    exports.onRendered = onRendered;
    exports.onWillPatch = onWillPatch;
    exports.onWillRender = onWillRender;
    exports.onWillStart = onWillStart;
    exports.onWillUnmount = onWillUnmount;
    exports.onWillUpdateProps = onWillUpdateProps;
    exports.reactive = reactive;
    exports.status = status;
    exports.useComponent = useComponent;
    exports.useEffect = useEffect;
    exports.useEnv = useEnv;
    exports.useExternalListener = useExternalListener;
    exports.useRef = useRef;
    exports.useState = useState;
    exports.useSubEnv = useSubEnv;
    exports.whenReady = whenReady;
    exports.xml = xml;

    Object.defineProperty(exports, '__esModule', { value: true });


    __info__.version = '2.0.0-alpha';
    __info__.date = '2021-11-22T09:18:09.768Z';
    __info__.hash = 'efd934d';
    __info__.url = 'https://github.com/odoo/owl';


})(this.owl = this.owl || {});
