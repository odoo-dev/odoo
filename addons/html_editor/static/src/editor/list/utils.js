/** @odoo-module */

export function getListMode(pnode) {
    if (pnode.tagName == "OL") {
        return "OL";
    }
    return pnode.classList.contains("o_checklist") ? "CL" : "UL";
}

export function createList(mode) {
    const node = document.createElement(mode == "OL" ? "OL" : "UL");
    if (mode == "CL") {
        node.classList.add("o_checklist");
    }
    return node;
}

export function insertListAfter(afterNode, mode, content = []) {
    const list = createList(mode);
    afterNode.after(list);
    list.append(
        ...content.map((c) => {
            const li = document.createElement("LI");
            li.append(...[].concat(c));
            return li;
        })
    );
    return list;
}
