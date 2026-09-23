import { findOperationTarget, getMicroViewInfo, getViewOperations, parseTargetArch } from "./utils";

/**
 * @typedef {Object} Change an operation of an inherited view, located in the
 *  arch of one of its ancestors (the view it changes)
 * @property {Object} view the view the operation belongs to
 * @property {Element} operation
 * @property {number} index the index of the operation in the view's arch
 *  (see `getViewOperations`)
 *
 * @typedef {Object} ChangeMap
 * @property {Object<number, Object>} views the views, indexed by id
 * @property {Map<number, {arch: string, parsed: Object|null}>} parsedArchs
 *  cache of the archs parsed to look for targets in (see `parseTargetArch`)
 * @property {Map<number, {targetId: number, change: Change}[]>} changesBySource
 *  the located changes of each view
 * @property {Map<number, Change[]>} changesByTarget the located changes
 *  changing each view
 * @property {Set<number>} bannerViewIds the located micro views, shown as a
 *  banner on the view they change instead of being listed
 */

/**
 * The target of each operation of an inherited view is looked for in the arch
 * of its ancestors, up to the first primary one (the views above it are not
 * changed by it, see `_combine` in ir_ui_view.py). The whole inheritance is
 * not computed, so this is a best effort: a target added by a view out of
 * the ancestors is not found, and a target found in several ancestors is
 * ambiguous. Such operations are not located.
 *
 * @param {Object<number, Object>} views the views, indexed by id
 * @returns {ChangeMap}
 */
export function buildChangeMap(views) {
    const changeMap = {
        views,
        parsedArchs: new Map(),
        changesBySource: new Map(),
        changesByTarget: new Map(),
        bannerViewIds: new Set(),
    };
    for (const view of Object.values(views)) {
        const located = locateViewChanges(changeMap, view);
        changeMap.changesBySource.set(view.id, located);
        if (located.length && getMicroViewInfo(view.arch)) {
            changeMap.bannerViewIds.add(view.id);
        }
    }
    changeMap.changesByTarget = indexChangesByTarget(changeMap);
    return changeMap;
}

/**
 * Locates again the changes that may be affected by a new arch of a view:
 * its own ones, and those of its descendants, as its arch is one of the
 * archs their targets are looked for in. The micro views shown as a banner
 * are kept, so that the list of views does not change while editing.
 *
 * @param {ChangeMap} changeMap
 * @param {number} viewId
 * @returns {ChangeMap} a new change map, or the given one if the arch is not
 *  well-formed (e.g. while it is being typed)
 */
export function updateChangeMap(changeMap, viewId) {
    const { views } = changeMap;
    if (!getParsedArch(changeMap, views[viewId])) {
        return changeMap;
    }
    const changesBySource = new Map(changeMap.changesBySource);
    for (const view of Object.values(views)) {
        if (
            view.id === viewId ||
            getAncestors(views, view, false).some(({ id }) => id === viewId)
        ) {
            changesBySource.set(view.id, locateViewChanges(changeMap, view));
        }
    }
    const newChangeMap = { ...changeMap, changesBySource };
    newChangeMap.changesByTarget = indexChangesByTarget(newChangeMap);
    return newChangeMap;
}

/**
 * @param {ChangeMap} changeMap
 * @param {number} viewId
 * @returns {Change[]} the located changes changing the view
 */
export function getChanges(changeMap, viewId) {
    return changeMap.changesByTarget.get(viewId) || [];
}

/**
 * @param {ChangeMap} changeMap
 * @param {number} viewId
 * @returns {{targetId: number, change: Change}[]} the located changes made by
 *  the view, each with the id of the view it changes
 */
export function getLocatedOperations(changeMap, viewId) {
    return changeMap.changesBySource.get(viewId) || [];
}

/**
 * @param {Object<number, Object>} views
 * @param {Object} view
 * @param {boolean} stopAtPrimary whether to stop at the first primary view
 * @returns {Object[]} the ancestors of the view, closest first
 */
function getAncestors(views, view, stopAtPrimary) {
    const ancestors = [];
    let ancestor = views[view.inherit_id?.[0]];
    while (ancestor) {
        ancestors.push(ancestor);
        if (stopAtPrimary && ancestor.mode === "primary") {
            break;
        }
        ancestor = views[ancestor.inherit_id?.[0]];
    }
    return ancestors;
}

/**
 * @param {ChangeMap} changeMap
 * @param {Object} view
 * @returns {Object|null} the parsed arch of the view (see `parseTargetArch`)
 */
function getParsedArch(changeMap, view) {
    const cached = changeMap.parsedArchs.get(view.id);
    if (cached?.arch === view.arch) {
        return cached.parsed;
    }
    const parsed = parseTargetArch(view.arch, Boolean(view.inherit_id));
    changeMap.parsedArchs.set(view.id, { arch: view.arch, parsed });
    return parsed;
}

/**
 * @param {ChangeMap} changeMap
 * @param {Object} view
 * @returns {{targetId: number, change: Change}[]} the located changes of the
 *  view (none for root and primary views, which do not change other views)
 */
function locateViewChanges(changeMap, view) {
    if (!view.inherit_id || view.mode === "primary") {
        return [];
    }
    const ancestors = getAncestors(changeMap.views, view, true);
    const located = [];
    for (const [index, operation] of (getViewOperations(view.arch) || []).entries()) {
        const owners = ancestors.filter((ancestor) => {
            const parsed = getParsedArch(changeMap, ancestor);
            return parsed && findOperationTarget(parsed.root, parsed.operations, operation);
        });
        if (owners.length === 1) {
            located.push({ targetId: owners[0].id, change: { view, operation, index } });
        }
    }
    return located;
}

/**
 * @param {ChangeMap} changeMap
 * @returns {Map<number, Change[]>} the changes of `changesBySource`, indexed
 *  by the view they change, in the order of the views
 */
function indexChangesByTarget({ views, changesBySource }) {
    const changesByTarget = new Map();
    for (const view of Object.values(views)) {
        for (const { targetId, change } of changesBySource.get(view.id) || []) {
            if (!changesByTarget.has(targetId)) {
                changesByTarget.set(targetId, []);
            }
            changesByTarget.get(targetId).push(change);
        }
    }
    return changesByTarget;
}
