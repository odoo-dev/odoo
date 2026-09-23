import { describe, expect, test } from "@odoo/hoot";

import {
    buildChangeMap,
    getChanges,
    updateChangeMap,
} from "@website/components/resource_editor/change_map";

function view(id, arch, { parentId = false, mode } = {}) {
    return {
        id,
        arch,
        inherit_id: parentId && [parentId, `view ${parentId}`],
        mode: mode || (parentId ? "extension" : "primary"),
    };
}

function indexViews(views) {
    return Object.fromEntries(views.map((v) => [v.id, v]));
}

const MICRO_HEADER = `<data><xpath expr="//header" position="attributes"><attribute name="class" add="x"/></xpath></data>`;

describe("buildChangeMap", () => {
    test("locates a change in the ancestor holding its target", () => {
        const views = indexViews([
            view(1, `<t t-name="root"><header/><main/></t>`),
            view(2, `<data><xpath expr="//main" position="inside"><div/></xpath></data>`, {
                parentId: 1,
            }),
            view(3, MICRO_HEADER, { parentId: 2 }),
        ]);
        const changeMap = buildChangeMap(views);
        expect(getChanges(changeMap, 1).map(({ view }) => view.id)).toEqual([2, 3]);
        expect(getChanges(changeMap, 2)).toEqual([]);
        expect([...changeMap.bannerViewIds]).toEqual([3]);
    });

    test("does not locate ambiguous or missing targets", () => {
        const views = indexViews([
            view(1, `<t t-name="root"><header/></t>`),
            view(2, `<data><xpath expr="/t" position="inside"><header/></xpath></data>`, {
                parentId: 1,
            }),
            view(3, MICRO_HEADER, { parentId: 2 }),
            view(4, `<data><xpath expr="//footer" position="after"><div/></xpath></data>`, {
                parentId: 1,
            }),
        ]);
        const changeMap = buildChangeMap(views);
        expect(getChanges(changeMap, 1)).toEqual([]);
        expect(getChanges(changeMap, 2)).toEqual([]);
        expect(changeMap.bannerViewIds.size).toBe(0);
    });

    test("stops at the first primary ancestor", () => {
        const views = indexViews([
            view(1, `<t t-name="root"><header/></t>`),
            view(2, `<data><xpath expr="//header" position="after"><main/></xpath></data>`, {
                parentId: 1,
                mode: "primary",
            }),
            view(3, MICRO_HEADER, { parentId: 2 }),
        ]);
        const changeMap = buildChangeMap(views);
        expect(getChanges(changeMap, 1)).toEqual([]);
        expect(getChanges(changeMap, 2)).toEqual([]);
    });
});

describe("updateChangeMap", () => {
    test("locates the changes of the descendants again", () => {
        const views = indexViews([
            view(1, `<t t-name="root"><header/></t>`),
            view(2, MICRO_HEADER, { parentId: 1 }),
        ]);
        const changeMap = buildChangeMap(views);
        views[1].arch = `<t t-name="root"><nav/></t>`;
        const updated = updateChangeMap(changeMap, 1);
        expect(getChanges(updated, 1)).toEqual([]);
        expect(getChanges(changeMap, 1).length).toBe(1);
        // Banners are kept while editing.
        expect([...updated.bannerViewIds]).toEqual([2]);
    });

    test("keeps the changes while the arch is not well-formed", () => {
        const views = indexViews([
            view(1, `<t t-name="root"><header/></t>`),
            view(2, MICRO_HEADER, { parentId: 1 }),
        ]);
        const changeMap = buildChangeMap(views);
        views[1].arch = `<t t-name="root"><header></t>`;
        expect(updateChangeMap(changeMap, 1)).toBe(changeMap);
    });
});
