import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { CheckboxItem } from "@web/core/dropdown/checkbox_item";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";
import { SelectMenu } from "@web/core/select_menu/select_menu";
import { user } from "@web/core/user";
import { sortBy } from "@web/core/utils/arrays";
import { KeepLast } from "@web/core/utils/concurrency";
import { useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";
import { usePopover } from "@web/core/popover/popover_hook";

import { locateOperations } from "./operation_map";
import { CodeEditorWithGutterMarkers } from "./code_editor_with_gutter_markers";
import { ResourceEditorWarningOverlay } from "./resource_editor_warning";
import {
    checkSCSS,
    checkXML,
    describeOperation,
    formatXML,
    getOperationRows,
    getOperationTargetRows,
    parseTargetArch,
} from "./utils";

import {
    Component,
    computed,
    onWillUnmount,
    onWillStart,
    useProps,
    proxy,
    signal,
    t,
    useEffect,
    usePlugin,
} from "@odoo/owl";
import { DebugModePlugin } from "@web/core/debug_mode_plugin";

const BUNDLES_RESTRICTION = [
    "web.assets_frontend",
    "web.assets_frontend_minimal",
    "web.assets_frontend_lazy",
];

/**
 * Lists the views with an operation on a row of the edited view, and the
 * targets of the operations of the edited view on this row.
 */
class ResourceOperationsPopover extends Component {
    static template = "website.ResourceOperationsPopover";
    props = useProps({
        title: t.string(),
        items: t.array(
            t.object({
                view: t.object(),
                description: t.string(),
                onSelect: t.function(),
            })
        ),
        // Popover service
        close: t.function().optional(),
    });
}

export class ResourceEditor extends Component {
    static components = {
        ResourceEditorWarningOverlay,
        CodeEditorWithGutterMarkers,
        Dropdown,
        CheckboxItem,
        DropdownItem,
        SelectMenu,
    };
    static template = "website.ResourceEditor";
    props = useProps({
        close: t.function().optional(() => () => {}),
    });

    editorRef = signal.ref();

    debugMode = usePlugin(DebugModePlugin);

    setup() {
        this.website = useService("website");
        this.orm = useService("orm");
        this.dialog = useService("dialog");

        this.keepLast = new KeepLast();
        this.operationsPopover = usePopover(ResourceOperationsPopover);
        // allLocatedOperations lists the located operations of every xml available
        // in the editor
        this.allLocatedOperations = signal([]);
        this.debouncedUpdateLocatedOperations = useDebounced(
            () => this.updateLocatedOperations(),
            300
        );
        this.currentOperations = computed(() => this.computeCurrentOperations());
        this.codeEditorMarkers = computed(() => this.computeCodeEditorMarkers());
        // The row to reveal in the code editor (see `CodeEditorWithGutterMarkers`).
        this.revealRow = signal(null);

        this.viewKey =
            this.website.pageDocument &&
            this.website.pageDocument.documentElement.dataset.viewXmlid;

        this.types = {
            xml: "XML (HTML)",
            scss: "SCSS (CSS)",
            js: "JS",
        };
        this.typeToCodeEditorModeMap = {
            xml: "qweb",
            scss: "scss",
            js: "javascript",
        };

        this.xmlFilters = {
            views: _t("Only Views"),
            all: _t("Views and Assets bundles"),
        };
        this.scssFilters = {
            custom: _t("Only Custom SCSS Files"),
            restricted: _t("Only Page SCSS Files"),
            all: _t("All SCSS Files"),
        };
        this.state = proxy({
            type: "xml",
            xmlFilter: "views",
            scssFilter: "custom",
            currentResource: false,
            showEditWarning: true,
            resources: {
                xml: {},
                js: {},
                scss: {},
            },
            sortedXML: [],
            sortedSCSS: [],
            sortedJS: [],
            saving: false,
        });

        let showErrorInterval;
        this.errors = proxy([]);
        useEffect(() => {
            clearInterval(showErrorInterval);
            if (this.errors.length) {
                this.showErrorLine();
                // The ace library updates its content asynchronously, and sometimes
                // at unexpected moments, so we consistently re-apply the error indicators
                // when they are errors. This is kind of a hack, but it works.
                showErrorInterval = setInterval(() => this.showErrorLine(), 500);
            } else {
                this.clearErrorLine();
            }
        });
        onWillUnmount(() => clearInterval(showErrorInterval));

        onWillStart(async () => this.loadResources());
    }

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    get context() {
        return {
            ...user.context,
            website_id: this.website.currentWebsite.id,
        };
    }

    get resourceInfo() {
        if (!this.state.currentResource) {
            return "";
        }
        if (this.state.type === "xml") {
            return _t("Template ID: %s", this.state.currentResource.key);
        } else if (this.state.type === "scss") {
            return _t("SCSS file: %s", this.state.currentResource.url);
        } else {
            return _t("JS file: %s", this.state.currentResource.url);
        }
    }

    /**
     * The located operations of the current resource (see `locateOperations`):
     * - `incoming`: the operations of other views on it, each with the row of
     *   its target in the current arch (null if the target is not found);
     * - `outgoing`: its operations on other views, each with the row of the
     *   operation in the current arch.
     * `wellFormed` is false while the arch cannot be parsed, in which case
     * the rows are unknown (undefined).
     *
     * @returns {{
     *  wellFormed: boolean,
     *  incoming: {view: Object, operation: Element, index: number, row: number|null|undefined}[],
     *  outgoing: {targetView: Object, operation: Element, row: number|null|undefined}[],
     * }}
     */
    computeCurrentOperations() {
        const resource = this.state.currentResource;
        if (this.state.type !== "xml" || !resource) {
            return { wellFormed: true, incoming: [], outgoing: [] };
        }
        const allLocatedOperations = this.allLocatedOperations();
        const incoming = allLocatedOperations.filter(({ targetId }) => targetId === resource.id);
        const outgoing = allLocatedOperations.filter(({ view }) => view.id === resource.id);
        if (!incoming.length && !outgoing.length) {
            return { wellFormed: true, incoming: [], outgoing: [] };
        }
        const targetRows = getOperationTargetRows(
            resource.arch,
            Boolean(resource.inherit_id),
            incoming.map(({ operation }) => operation)
        );
        const operationRows = getOperationRows(resource.arch);
        return {
            wellFormed: Boolean(targetRows),
            incoming: incoming.map((locatedOperation, index) => ({
                ...locatedOperation,
                row: targetRows?.[index],
            })),
            outgoing: outgoing.map(({ targetId, operation, index }) => ({
                targetView: this.state.resources.xml[targetId],
                operation,
                row: operationRows ? operationRows[index] ?? null : undefined,
            })),
        };
    }

    /**
     * The gutter markers (see `CodeEditorWithGutterMarkers`) on the rows changed by
     * other views, with the number of these views, and on the rows of the
     * operations whose target is located. Null while the arch is not
     * well-formed, to remove the current ones (their rows are unknown).
     */
    computeCodeEditorMarkers() {
        const { wellFormed, incoming, outgoing } = this.currentOperations();
        if (!wellFormed) {
            return null;
        }
        const itemsByRow = Map.groupBy(
            [...incoming, ...outgoing].filter(({ row }) => row !== null),
            ({ row }) => row
        );
        return sortBy(
            [...itemsByRow].map(([row, items]) => ({
                row,
                count: new Set(items.filter(({ view }) => view).map(({ view }) => view.id)).size,
                target: items.some(({ targetView }) => targetView),
            })),
            "row"
        );
    }

    /**
     * @returns {{view: Object, operations: Object[]}[]} the views with
     *  operations on the current resource, each with these operations
     */
    getIncomingViews() {
        const operationsByView = Map.groupBy(this.currentOperations().incoming, ({ view }) => view);
        return [...operationsByView].map(([view, operations]) => ({ view, operations }));
    }

    /**
     * @returns {number} how many incoming operations have no target in the
     *  current arch
     *  (0 while it is not well-formed, as it is unknown)
     */
    getNotLocatedCount() {
        return this.currentOperations().incoming.filter(({ row }) => row === null).length;
    }

    /**
     * @returns {string}
     */
    getChangedByLabel() {
        const count = this.getIncomingViews().length;
        const label = count === 1 ? _t("Changed by 1 view") : _t("Changed by %s views", count);
        const notLocatedCount = this.getNotLocatedCount();
        if (!notLocatedCount) {
            return label;
        }
        return _t("%(label)s · %(count)s not located", { label, count: notLocatedCount });
    }

    /**
     * @param {Object[]} operations items of `currentOperations.incoming`
     * @returns {string}
     */
    getOperationsDescription(operations) {
        return operations
            .map(({ operation, row }) => {
                const effect = describeOperation(operation);
                if (row === undefined) {
                    return effect;
                }
                const location = row === null ? _t("not located") : _t("line %s", row + 1);
                return _t("%(effect)s, %(location)s", { effect, location });
            })
            .join(" · ");
    }

    get selectMenuProps() {
        const props = {
            onSelect: (value) => {
                this.state.currentResource = this.state.resources[this.state.type][value];
            },
            autoSort: false,
            required: true,
        };
        if (this.state.type === "xml") {
            const choices = this.state.sortedXML.map((view) => ({
                value: view.id,
                label: view.label,
            }));
            const value = this.state.currentResource?.id;
            return { ...props, choices, value };
        } else {
            const { type, sortedSCSS, sortedJS } = this.state;
            const bundles = type === "scss" ? sortedSCSS : sortedJS;
            const groups = bundles.map(([name, files]) => {
                const choices = files.map((file) => ({ value: file.url, label: file.label }));
                return { label: name, choices };
            });
            const value = this.state.currentResource?.url;
            return { ...props, groups, value };
        }
    }

    // -------------------------------------------------------------------------
    // Methods
    // -------------------------------------------------------------------------

    /**
     * Checks resource is customized or not.
     *
     * @param {string} url
     * @returns {boolean}
     */
    isCustomResource(url) {
        // TODO we should be able to detect if the XML template is customized
        // to not show the warning in that case
        if (this.state.type === "scss") {
            return this.state.resources.scss[url].customized;
        } else if (this.state.type === "js") {
            return this.state.resources.js[url].customized;
        }
        return false;
    }

    async loadResources() {
        const resources = await this.keepLast.add(
            rpc("/website/get_assets_editor_resources", {
                key: this.viewKey,
                bundles: this.state.xmlFilter === "all",
                bundles_restriction: BUNDLES_RESTRICTION,
                only_user_custom_files: this.state.scssFilter === "custom",
            })
        );
        this.state.resources = { xml: {}, js: {}, scss: {} };
        this.processResources(resources.views || [], "xml");
        this.processResources(resources.scss || [], "scss");
        this.processResources(resources.js || [], "js");
        const type = this.state.type;
        if (this.state.currentResource) {
            this.state.currentResource = this.state.resources[type][this.state.currentResource.id];
        }
        if (!this.state.currentResource) {
            this.setDefaultFile();
        }
        this.errors.length = 0;
    }

    processResources(resources, type) {
        if (type === "xml") {
            // Only keep the active views and index them by ID.
            const indexedById = {};
            resources
                .filter((view) => view.active)
                .forEach((view) => {
                    view.type = "xml";
                    indexedById[view.id] = view;
                });
            Object.assign(this.state.resources.xml, indexedById);

            // Initialize a 0 level for each view and assign them an array containing their children.
            const roots = [];
            Object.values(this.state.resources.xml).forEach((view) => {
                view.level = 0;
                view.children = [];
            });
            Object.values(this.state.resources.xml).forEach((view) => {
                const parentId = view.inherit_id[0];
                const parent = parentId && this.state.resources.xml[parentId];
                if (parent) {
                    parent.children.push(view);
                } else {
                    roots.push(view);
                }
            });

            // Assign the correct level based on children key and save a sorted array where
            // each view is followed by their children.
            const sortedXML = [];
            const visit = (view, level) => {
                view.level = level;
                sortedXML.push(view);
                view.children.forEach((child) => {
                    visit(child, level + 1);
                });
            };
            roots.forEach((root) => {
                visit(root, 0);
            });

            this.state.sortedXML = sortedXML;

            this.allLocatedOperations.set(locateOperations(this.state.resources.xml));

            // Compute labels
            Object.values(this.state.resources.xml).forEach((view) => {
                view.label = `${"-".repeat(view.level)} ${view.name}`;
                if (this.debugMode.isActive() && view.xml_id) {
                    view.label += ` (${view.xml_id})`;
                }
            });
        } else if (type === "scss" || type === "js") {
            // The received scss or js data is already sorted by bundle and DOM order
            if (type === "scss") {
                this.state.sortedSCSS = resources;
            } else {
                this.state.sortedJS = resources;
            }

            // Store the URL ungrouped by bundle and use the URL as key (resource ID)
            resources.forEach(([bundle, files]) => {
                const indexedByUrl = {};
                files.forEach((file) => {
                    // Compute labels
                    file.label = file.url.split("/").at(-1).split(".")[0];
                    if (this.debugMode.isActive()) {
                        file.label += ` (${file.url})`;
                    }

                    file.bundle = bundle;
                    file.id = file.url; // for consistency with xml resources
                    file.type = type;
                    indexedByUrl[file.url] = file;
                });
                if (type === "scss") {
                    Object.assign(this.state.resources.scss, indexedByUrl);
                } else {
                    Object.assign(this.state.resources.js, indexedByUrl);
                }
            });
        }
    }

    /**
     * Locates the operations again, after an edit of a view.
     */
    updateLocatedOperations() {
        const resource = this.state.currentResource;
        // Keep the current located operations while the arch is not well-formed
        // (for example, while the user types).
        if (resource?.type !== "xml" || !parseTargetArch(resource.arch, false)) {
            return;
        }
        this.allLocatedOperations.set(locateOperations(this.state.resources.xml));
    }

    /**
     * Forces the current scss/js file identified by its url to be reset to the way
     * it was before the user started editing it.
     *
     * @todo views (xml) reset is not supported yet
     *
     * @returns {Promise}
     */
    async resetResource() {
        if (this.state.type === "xml") {
            throw new Error(_t("Reseting views is not supported yet"));
        }
        const resource = this.state.currentResource;
        await this.orm.call("website.assets", "reset_asset", [resource.url, resource.bundle], {
            context: this.context,
        });
        await this.loadResources();
        this.website.contentWindow.location.reload();
    }

    async saveResources() {
        const { js, scss, xml } = this.state.resources;
        const toSave = {
            js: Object.values(js).filter((r) => r.dirty),
            scss: Object.values(scss).filter((r) => r.dirty),
            // child views first as COW on a parent would delete them
            xml: sortBy(
                Object.values(xml).filter((r) => r.dirty),
                "id"
            ).reverse(),
        };

        for (const [type, resources] of Object.entries(toSave)) {
            for (let i = 0; i < resources.length; i++) {
                const arch = resources[i].arch;
                const { isValid, error } = type === "xml" ? checkXML(arch) : checkSCSS(arch);
                if (!isValid) {
                    this.errors.push({ error, resource: resources[i] });
                }
            }
        }
        if (this.errors.length) {
            // switch to the first resource in error if the current has no error
            if (
                !this.errors
                    .map(({ resource }) => resource.id)
                    .includes(this.state.currentResource.id)
            ) {
                this.state.currentResource = this.errors[0].resource;
                this.state.type = this.errors[0].resource.type;
            }
            return;
        }

        // sequentially save all resources
        for (const [type, resources] of Object.entries(toSave)) {
            for (const resource of resources) {
                if (type === "xml") {
                    await this.saveXML(resource);
                } else {
                    await this.saveSCSSorJS(resource);
                }
            }
        }
        await this.loadResources();
        this.website.contentWindow.location.reload();
    }

    /**
     * Saves a unique SCSS or JS file.
     *
     * @private
     * @param {Object} resource a SCSS or JS file to save
     * @return {Promise} indicates if the save is finished or if an error occurred.
     */
    async saveSCSSorJS(resource) {
        const { url, arch } = resource;
        const isJSFile = String(url).endsWith(".js");
        const bundle = isJSFile
            ? this.state.resources.js[url].bundle
            : this.state.resources.scss[url].bundle;
        const fileType = isJSFile ? "js" : "scss";
        const params = [url, bundle, arch, fileType];
        await this.orm.call("website.assets", "save_asset", params, { context: this.context });
        delete resource.dirty;
    }

    /**
     * Saves a unique XML view.
     *
     * @param {Object} resource an xml view to save
     * @returns {Promise} indicates if the save is finished or if an error occurred.
     */
    async saveXML(resource) {
        const { id, arch } = resource;
        await rpc("/website/save_xml", {
            view_id: id,
            arch: arch,
        });
        delete resource.dirty;
    }

    setDefaultFile() {
        if (this.state.type === "xml") {
            const views = Object.values(this.state.resources.xml);
            let view = views.find((view) => [view.id, view.xml_id].includes(this.viewKey));
            if (!view) {
                view = views.find((view) => view.key === this.viewKey);
            }
            this.state.currentResource = view || this.state.sortedXML[0] || false;
        } else if (this.state.type === "scss") {
            // By default show the user_custom_rules.scss one as some people
            // would write rules in user_custom_bootstrap_overridden.scss
            // otherwise, not reading the comment inside explaining how that
            // file should be used.
            this.state.currentResource =
                this.state.resources.scss["/website/static/src/scss/user_custom_rules.scss"];
        } else {
            this.state.currentResource =
                this.state.sortedJS.map(([_, files]) => files).flat()[0] || false;
        }
    }

    showErrorLine() {
        const el = this.editorRef();
        if (!el) {
            // Possibly destroyed.
            return;
        }
        const resourceId = this.state.currentResource.id;
        const error = this.errors.find(({ resource }) => resource.id === resourceId)?.error;
        if (error) {
            const { line, message } = error;
            const gutterCell = el.querySelectorAll(".ace_gutter-cell")[line - 1];
            if (gutterCell && !gutterCell.classList.contains("o_error")) {
                gutterCell.classList.add("o_error");
                gutterCell.setAttribute("data-tooltip", message);
                gutterCell.setAttribute("data-tooltip-position", "left");
            }
        }
    }

    clearErrorLine() {
        const el = this.editorRef();
        if (!el) {
            // Possibly destroyed.
            return;
        }
        const allGutterCells = el.querySelectorAll(".ace_gutter-cell");
        for (const gutterCell of allGutterCells) {
            gutterCell.classList.remove("o_error");
            gutterCell.removeAttribute("data-tooltip");
            gutterCell.removeAttribute("data-tooltip-position");
        }
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    onEditorChange(value) {
        const currentResource = this.state.currentResource;
        currentResource.arch = value;
        currentResource.dirty = true;
        this.errors.length = 0;
        if (currentResource.type === "xml") {
            this.debouncedUpdateLocatedOperations();
        }
    }

    /**
     * Opens a view, on one of its operations.
     *
     * @param {number} viewId
     * @param {number} [operationIndex=0] see `parseTargetArch`
     */
    openView(viewId, operationIndex = 0) {
        const view = this.state.resources.xml[viewId];
        this.openViewOnRow(view, getOperationRows(view.arch)?.[operationIndex]);
    }

    /**
     * Opens the view changed by an operation of the current view, on the
     * target of the operation.
     *
     * @param {Object} target an item of `currentOperations.outgoing`
     */
    goToTarget({ targetView, operation }) {
        const rows = getOperationTargetRows(targetView.arch, Boolean(targetView.inherit_id), [
            operation,
        ]);
        this.openViewOnRow(targetView, rows?.[0]);
    }

    /**
     * @param {Object} view
     * @param {number|null|undefined} row the row to reveal, if known
     */
    openViewOnRow(view, row) {
        this.operationsPopover.close();
        this.state.currentResource = view;
        if (typeof row === "number") {
            this.revealRow.set({ sessionId: view.id, row });
        }
    }

    /**
     * @param {number} row
     * @param {HTMLElement} cellEl the gutter cell of the row
     */
    onMarkerClick(row, cellEl) {
        const { incoming, outgoing } = this.currentOperations();
        const rowIncoming = incoming.filter((item) => item.row === row);
        const rowOutgoing = outgoing.filter((item) => item.row === row);
        if (!rowIncoming.length && rowOutgoing.length === 1) {
            this.goToTarget(rowOutgoing[0]);
            return;
        }
        const items = [
            ...rowIncoming.map((item) => ({
                view: item.view,
                description: describeOperation(item.operation),
                onSelect: () => this.openView(item.view.id, item.index),
            })),
            ...rowOutgoing.map((target) => ({
                view: target.targetView,
                description: _t("Go to target"),
                onSelect: () => this.goToTarget(target),
            })),
        ];
        if (items.length) {
            this.operationsPopover.open(cellEl, { title: _t("Line %s", row + 1), items });
        }
    }

    /**
     * @param {"xml"|"scss"|"js"} type
     */
    onFileTypeChange(type) {
        if (type !== this.state.type) {
            this.state.type = type;
            this.setDefaultFile();
        }
    }

    /**
     * @param {"xml"|"scss"} type
     * @param {string} filter
     */
    onFilterChange(type, filter) {
        if (type === "scss") {
            this.state.scssFilter = filter;
        } else if (type === "xml") {
            this.state.xmlFilter = filter;
        }
        this.loadResources();
    }

    onFormat() {
        if (this.state.type === "xml") {
            const { isValid, error } = checkXML(this.state.currentResource.arch);
            if (isValid) {
                this.state.currentResource.arch = formatXML(this.state.currentResource.arch);
            } else {
                this.errors.push({ error, resource: this.state.currentResource });
            }
        }
    }

    onReset() {
        this.dialog.add(ConfirmationDialog, {
            title: _t("Reset to default?"),
            body: _t("All your custom changes will be lost. Are you sure?"),
            confirmLabel: _t("Reset"),
            confirm: () => this.resetResource(),
            cancel: () => {},
        });
    }

    async onSave() {
        this.state.saving = true;
        try {
            await this.saveResources();
        } finally {
            this.state.saving = false;
        }
    }
}
