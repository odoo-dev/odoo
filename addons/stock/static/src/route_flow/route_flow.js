import { Component, onMounted, onWillStart, proxy, signal, useListener, useProps } from "@odoo/owl";
import { _t } from "@web/core/l10n/translation";
import { registry } from "@web/core/registry";
import { RecordSelector } from "@web/core/record_selectors/record_selector";
import { useService } from "@web/core/utils/hooks";
import { standardActionServiceProps } from "@web/webclient/actions/action_plugin";

// Layout constants (px)
const NODE_W = 190;
const NODE_H = 64;
const CARD_W = 230;
const CARD_H = 128;
const GAP = CARD_W + 110; // horizontal space between two location columns
const COL_W = NODE_W + GAP;
const ROW_H = 150;
const PAD = 32;
const CARD_SPACING = 16;

const ROUTE_COLORS = [
    "#2E86C1", "#28B463", "#CA6F1E", "#8E44AD", "#C0392B",
    "#17A589", "#D4AC0D", "#5D6D7E", "#E74C8B", "#1F618D",
];

const USAGE_ICONS = {
    supplier: "local_shipping",
    customer: "person",
    internal: "inventory_2",
    production: "factory",
    transit: "swap_horiz",
    inventory: "balance",
    view: "folder",
};
// Order used to sort locations of a same column (sources first).
const USAGE_ORDER = ["supplier", "production", "transit", "internal", "view", "inventory", "customer"];

const ACTION_ICONS = {
    pull: "login", // "call_received" is not in the icon subset
    push: "arrow_forward",
    pull_push: "swap_horiz",
    buy: "shopping_cart",
    manufacture: "precision_manufacturing",
};

export class RouteFlow extends Component {
    static template = "stock.RouteFlow";
    static components = { RecordSelector };
    props = useProps(standardActionServiceProps);

    setup() {
        this.orm = useService("orm");
        this.actionService = useService("action");
        this.state = proxy({
            warehouseId: false,
            routeId: false, // false = all routes of the warehouse
            productId: false, // set = only the rules this product goes through
            categoryId: false, // set = only the rules a product of this category goes through
            version: 0, // bumped after each (re)load to trigger a render
            hoveredRuleId: false,
            zoom: false, // false = fit to screen width
            wrapperWidth: 0,
        });
        this.wrapperRef = signal.ref();
        const measure = () => {
            const el = this.wrapperRef();
            if (el) {
                this.state.wrapperWidth = el.clientWidth;
            }
        };
        onMounted(measure);
        useListener(window, "resize", measure);
        this.data = { warehouses: [], routes: [], rules: [], locations: {}, labels: {}, productFlow: null };
        this.constants = { NODE_W, NODE_H, CARD_W, CARD_H };
        onWillStart(async () => {
            await this.loadLabels();
            await this.loadData();
        });
    }

    // -------------------------------------------------------------------------
    // Data
    // -------------------------------------------------------------------------

    async loadLabels() {
        const ruleFields = await this.orm.call("stock.rule", "fields_get", [["action", "procure_method", "auto"]], {
            attributes: ["selection"],
        });
        const locFields = await this.orm.call("stock.location", "fields_get", [["usage"]], {
            attributes: ["selection"],
        });
        const toDict = (sel) => Object.fromEntries(sel || []);
        this.data.labels = {
            action: toDict(ruleFields.action.selection),
            procure_method: toDict(ruleFields.procure_method.selection),
            auto: toDict(ruleFields.auto.selection),
            usage: toDict(locFields.usage.selection),
        };
    }

    async loadData() {
        const [warehouses, routes] = await Promise.all([
            this.orm.searchRead("stock.warehouse", [], ["name", "code", "lot_stock_id"]),
            this.orm.searchRead("stock.route", [], [
                "name", "sequence", "product_selectable", "product_categ_selectable",
                "warehouse_selectable", "package_type_selectable", "warehouse_ids",
            ]),
        ]);
        const rules = await this.orm.searchRead(
            "stock.rule",
            [["route_id", "in", routes.map((r) => r.id)]],
            [
                "name", "action", "location_src_id", "location_dest_id", "picking_type_id",
                "procure_method", "delay", "auto", "route_id", "warehouse_id",
                "propagate_cancel", "sequence", "location_dest_from_rule",
            ]
        );
        // searchRead returns many2one as [id, display_name]: normalize to {id, display_name}.
        const m2o = (value) => (Array.isArray(value) ? { id: value[0], display_name: value[1] } : value || false);
        for (const rule of rules) {
            for (const field of ["location_src_id", "location_dest_id", "picking_type_id", "route_id", "warehouse_id"]) {
                rule[field] = m2o(rule[field]);
            }
        }
        const pickingTypeIds = [...new Set(rules.map((r) => r.picking_type_id?.id).filter(Boolean))];
        const pickingTypes = await this.orm.searchRead(
            "stock.picking.type",
            [["id", "in", pickingTypeIds]],
            ["default_location_src_id", "default_location_dest_id"],
            { context: { active_test: false } }
        );
        const pickingTypeById = Object.fromEntries(
            pickingTypes.map((pt) => [
                pt.id,
                { src: m2o(pt.default_location_src_id), dest: m2o(pt.default_location_dest_id) },
            ])
        );
        const locationIds = new Set();
        for (const rule of rules) {
            // Where the goods physically go / come from (see stock.move location computation).
            const pt = pickingTypeById[rule.picking_type_id?.id] || {};
            rule.physicalDest =
                ["pull", "pull_push", "buy", "manufacture"].includes(rule.action) &&
                !rule.location_dest_from_rule &&
                pt.dest
                    ? pt.dest
                    : rule.location_dest_id;
            rule.physicalSrc = rule.location_src_id || (rule.action === "buy" && pt.src) || false;
            if (rule.physicalSrc) {
                locationIds.add(rule.physicalSrc.id);
            }
            locationIds.add(rule.physicalDest.id);
            if (rule.location_src_id) {
                locationIds.add(rule.location_src_id.id);
            }
            locationIds.add(rule.location_dest_id.id);
        }
        const locations = await this.orm.searchRead(
            "stock.location",
            [["id", "in", [...locationIds]]],
            ["name", "complete_name", "usage", "warehouse_id"],
            { context: { active_test: false } }
        );
        for (const location of locations) {
            location.warehouse_id = Array.isArray(location.warehouse_id)
                ? { id: location.warehouse_id[0], display_name: location.warehouse_id[1] }
                : false;
        }
        routes.forEach((route, index) => (route.color = ROUTE_COLORS[index % ROUTE_COLORS.length]));
        this.data.warehouses = warehouses;
        this.data.routes = routes;
        this.data.rules = rules;
        this.data.locations = Object.fromEntries(locations.map((l) => [l.id, l]));
        if (!this.state.warehouseId || !warehouses.some((w) => w.id === this.state.warehouseId)) {
            this.state.warehouseId = warehouses[0]?.id || false;
        }
        await this.loadProductFlow();
    }

    /** Rules the selected product goes through, as found by the procurement (server side). */
    async loadProductFlow() {
        this.data.productFlow = null;
        this.data.priorities = new Map();
        if ((this.state.productId || this.state.categoryId) && this.state.warehouseId) {
            const flow = await this.orm.call(
                "stock.rule",
                "get_product_flow",
                [this.state.productId || false, this.state.warehouseId],
                {
                    category_id: this.state.productId ? false : this.state.categoryId,
                    with_priorities: this.withPriorities,
                }
            );
            this.data.productFlow = new Map(flow.map((step) => [step.rule_id, step.role]));
            this.data.priorities = new Map(flow.filter((s) => s.priority).map((s) => [s.rule_id, s.priority]));
        }
        this.state.version++;
    }

    // -------------------------------------------------------------------------
    // Filtering
    // -------------------------------------------------------------------------

    /** Rules relevant for the selected warehouse (all routes). */
    get warehouseRules() {
        this.state.version; // subscribe
        const productFlow = this.data.productFlow;
        if (productFlow) {
            // May include rules of another warehouse (inter-warehouse resupply).
            return this.data.rules.filter((rule) => productFlow.has(rule.id));
        }
        const whId = this.state.warehouseId;
        return this.data.rules.filter((rule) => {
            if (rule.warehouse_id) {
                return rule.warehouse_id.id === whId;
            }
            const src = rule.physicalSrc && this.data.locations[rule.physicalSrc.id];
            const dest = this.data.locations[rule.physicalDest.id];
            return [src, dest].some((loc) => loc?.warehouse_id?.id === whId);
        });
    }

    get routeList() {
        const rules = this.warehouseRules;
        const countByRoute = {};
        for (const rule of rules) {
            countByRoute[rule.route_id.id] = (countByRoute[rule.route_id.id] || 0) + 1;
        }
        return this.data.routes
            .filter((route) => countByRoute[route.id])
            .map((route) => ({
                ...route,
                ruleCount: countByRoute[route.id],
                appliesOn: [
                    route.product_selectable && _t("Product"),
                    route.product_categ_selectable && _t("Category"),
                    route.warehouse_selectable && _t("Warehouse"),
                    route.package_type_selectable && _t("Package"),
                ].filter(Boolean),
            }));
    }

    get visibleRules() {
        const routeId = this.state.routeId;
        return this.warehouseRules.filter((rule) => !routeId || rule.route_id.id === routeId);
    }

    get selectedRoute() {
        return this.data.routes.find((r) => r.id === this.state.routeId);
    }

    routeColor(routeId) {
        return this.data.routes.find((r) => r.id === routeId)?.color || "#888";
    }

    // -------------------------------------------------------------------------
    // Graph layout
    // -------------------------------------------------------------------------

    _sourceNode(rule) {
        if (rule.physicalSrc) {
            return this._locationNode(rule.physicalSrc.id);
        }
        // Buy / Manufacture rules have no source location: use a virtual node.
        const isBuy = rule.action === "buy";
        return {
            key: `virtual_${rule.action}`,
            name: isBuy ? _t("Vendors") : rule.action === "manufacture" ? _t("Production") : _t("Any source"),
            subtitle: this.data.labels.action[rule.action] || rule.action,
            usage: isBuy ? "supplier" : "production",
            icon: isBuy ? "local_shipping" : "factory",
            locationId: false,
        };
    }

    _locationNode(locationId) {
        const loc = this.data.locations[locationId];
        return {
            key: `loc_${locationId}`,
            name: loc?.complete_name || loc?.name || "?",
            subtitle: this.data.labels.usage[loc?.usage] || "",
            usage: loc?.usage,
            icon: USAGE_ICONS[loc?.usage] || "location_on",
            locationId,
        };
    }

    get graph() {
        const rules = this.visibleRules;
        const nodes = new Map();
        const edges = [];
        for (const rule of rules) {
            const from = this._sourceNode(rule);
            const to = this._locationNode(rule.physicalDest.id);
            nodes.set(from.key, nodes.get(from.key) || from);
            nodes.set(to.key, nodes.get(to.key) || to);
            edges.push({ rule, from: from.key, to: to.key });
        }
        // Pull rules whose operation type takes the goods elsewhere than where the
        // need is (e.g. Pick: Stock → Customers, the goods go to the Packing Zone).
        const needs = [];
        const needOnly = new Set();
        if (this.showPullNeeds) {
            for (const rule of rules) {
                if (rule.physicalDest.id === rule.location_dest_id.id || this.isBeaten(rule)) {
                    continue;
                }
                const to = this._locationNode(rule.location_dest_id.id);
                if (!nodes.has(to.key)) {
                    nodes.set(to.key, to);
                    needOnly.add(to.key);
                }
                needs.push({ rule, to: to.key, physicalTo: `loc_${rule.physicalDest.id}` });
            }
        }
        if (!nodes.size) {
            return { nodes: [], edges: [], cards: [], needs: [], width: 0, height: 0 };
        }

        // 1. Rank = longest path from a source (capped to break cycles).
        const keys = [...nodes.keys()];
        const rank = Object.fromEntries(keys.map((k) => [k, 0]));
        for (let i = 0; i < keys.length; i++) {
            let changed = false;
            for (const e of edges) {
                if (e.from !== e.to && rank[e.to] < rank[e.from] + 1 && rank[e.from] + 1 < keys.length) {
                    rank[e.to] = rank[e.from] + 1;
                    changed = true;
                }
            }
            if (!changed) {
                break;
            }
        }
        // Locations only reached by a need: right after where the goods physically go.
        for (const need of needs) {
            if (needOnly.has(need.to)) {
                rank[need.to] = Math.max(rank[need.to], rank[need.physicalTo] + 1);
            }
        }
        // Nodes without incoming edge (vendors, production...) are placed as late as
        // possible, right before their first target, to avoid long edges.
        for (const k of keys) {
            const hasIncoming = edges.some((e) => e.to === k && e.from !== k);
            const targets = edges.filter((e) => e.from === k && e.to !== k).map((e) => rank[e.to]);
            if (!hasIncoming && targets.length) {
                rank[k] = Math.max(0, Math.min(...targets) - 1);
            }
        }
        // Compress ranks (no empty column).
        const usedRanks = [...new Set(Object.values(rank))].sort((a, b) => a - b);
        for (const k of keys) {
            rank[k] = usedRanks.indexOf(rank[k]);
        }

        // 2. Order nodes inside each column (usage, then barycenter of predecessors).
        const columns = usedRanks.map(() => []);
        for (const k of keys) {
            columns[rank[k]].push(nodes.get(k));
        }
        const usageIdx = (n) => {
            const i = USAGE_ORDER.indexOf(n.usage);
            return i === -1 ? USAGE_ORDER.length : i;
        };
        columns[0].sort((a, b) => usageIdx(a) - usageIdx(b) || a.name.localeCompare(b.name));
        const position = {};
        columns[0].forEach((n, i) => (position[n.key] = i));
        for (let c = 1; c < columns.length; c++) {
            const bary = (n) => {
                const preds = edges.filter((e) => e.to === n.key && rank[e.from] < c).map((e) => position[e.from]);
                return preds.length ? preds.reduce((a, b) => a + b, 0) / preds.length : 999;
            };
            columns[c].sort((a, b) => bary(a) - bary(b) || usageIdx(a) - usageIdx(b));
            columns[c].forEach((n, i) => (position[n.key] = i));
        }

        // 3. Coordinates (columns vertically centered).
        const maxRows = Math.max(...columns.map((col) => col.length));
        const nodeList = [];
        columns.forEach((col, c) => {
            const offset = ((maxRows - col.length) * ROW_H) / 2;
            col.forEach((n, i) => {
                n.x = PAD + c * COL_W;
                n.y = PAD + offset + i * ROW_H;
                n.cx = n.x + NODE_W / 2;
                n.cy = n.y + NODE_H / 2;
                nodeList.push(n);
            });
        });

        // 4. Rule cards: placed in the gap right after their source column,
        //    stacked to avoid overlaps.
        const cardsByGap = {};
        for (const e of edges) {
            const from = nodes.get(e.from);
            const to = nodes.get(e.to);
            const gap = rank[e.from];
            const adjacent = rank[e.to] === gap + 1;
            const desiredCenter = adjacent ? (from.cy + to.cy) / 2 : from.cy;
            const card = { edge: e, from, to, gap, desiredY: desiredCenter - CARD_H / 2 };
            (cardsByGap[gap] ||= []).push(card);
        }
        const cards = [];
        for (const [gap, list] of Object.entries(cardsByGap)) {
            list.sort((a, b) => a.desiredY - b.desiredY || a.edge.rule.sequence - b.edge.rule.sequence);
            // Center the stack around the mean desired position, then push down overlaps.
            const total = list.length * CARD_H + (list.length - 1) * CARD_SPACING;
            const mean = list.reduce((s, c) => s + c.desiredY + CARD_H / 2, 0) / list.length;
            let y = Math.max(PAD, Math.min(list[0].desiredY, mean - total / 2));
            for (const card of list) {
                card.y = Math.max(card.desiredY, y);
                y = card.y + CARD_H + CARD_SPACING;
                card.x = PAD + Number(gap) * COL_W + NODE_W + (GAP - CARD_W) / 2;
                cards.push(card);
            }
        }

        // 5. Edge paths: source -> card -> destination.
        const curve = (x1, y1, x2, y2) => {
            const dx = Math.max(40, Math.abs(x2 - x1) / 2);
            return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
        };
        const paths = cards.map((card) => {
            const rule = card.edge.rule;
            const midY = card.y + CARD_H / 2;
            const backward = card.to.x <= card.from.x;
            const end = backward
                ? `M ${card.x + CARD_W} ${midY} C ${card.x + CARD_W + 60} ${midY}, ${card.to.cx} ${card.to.y + NODE_H + 80}, ${card.to.cx} ${card.to.y + NODE_H}`
                : curve(card.x + CARD_W, midY, card.to.x, card.to.cy);
            return {
                key: rule.id,
                ruleId: rule.id,
                color: this.routeColor(rule.route_id.id),
                dash: rule.action === "push" ? "8 6" : rule.action === "pull_push" ? "2 5" : "",
                d1: curve(card.from.x + NODE_W, card.from.cy, card.x, midY),
                d2: end,
            };
        });

        const width = PAD * 2 + (columns.length - 1) * COL_W + NODE_W;
        const height =
            Math.max(
                ...nodeList.map((n) => n.y + NODE_H + 90),
                ...cards.map((c) => c.y + CARD_H)
            ) + PAD;
        return { nodes: nodeList, cards, paths, needs, width, height };
    }

    /** Scale applied to the canvas: user zoom, or fit-to-width (never above 100%). */
    get scale() {
        if (this.state.zoom) {
            return this.state.zoom;
        }
        const width = this.graph.width;
        if (!width || !this.state.wrapperWidth) {
            return 1;
        }
        return Math.max(0.4, Math.min(1, (this.state.wrapperWidth - 24) / width));
    }

    zoomBy(delta) {
        const next = Math.round((this.scale + delta) * 10) / 10;
        this.state.zoom = Math.max(0.3, Math.min(1.5, next));
    }

    zoomFit() {
        this.state.zoom = false;
    }

    // -------------------------------------------------------------------------
    // Card helpers
    // -------------------------------------------------------------------------

    ruleInfo(rule) {
        const labels = this.data.labels;
        const isPush = rule.action === "push";
        return {
            icon: ACTION_ICONS[rule.action] || "shuffle",
            actionLabel: labels.action[rule.action] || rule.action,
            operation: rule.picking_type_id?.display_name || "",
            method:
                rule.action === "buy"
                    ? _t("Creates a Request for Quotation")
                    : rule.action === "manufacture"
                    ? _t("Creates a Manufacturing Order")
                    : isPush
                    ? labels.auto[rule.auto]
                    : labels.procure_method[rule.procure_method],
            isMto: ["pull", "pull_push"].includes(rule.action) && rule.procure_method !== "make_to_stock",
            delay: rule.delay,
            propagateCancel: rule.propagate_cancel,
            routeName: rule.route_id.display_name,
            needIn: rule.physicalDest.id !== rule.location_dest_id.id ? rule.location_dest_id.display_name : false,
            color: this.routeColor(rule.route_id.id),
            replenishment: this.data.productFlow?.get(rule.id) === "replenishment",
            // With priorities: rank among the rules competing for the same need, or why it lost.
            beaten: this.isBeaten(rule),
            priority: this.data.priorities?.get(rule.id) || false,
        };
    }

    /** Also draw where the need of a pull rule is, when its goods go elsewhere. */
    get showPullNeeds() {
        return false;
    }

    /** Also load the rules each rule of the product path beat (shown greyed out). */
    get withPriorities() {
        return false;
    }

    /** Rule competing with a rule of the product path, but not used for this product. */
    isBeaten(rule) {
        return this.data.productFlow?.get(rule.id) === "beaten";
    }

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    onWarehouseChange(ev) {
        this.state.warehouseId = parseInt(ev.target.value);
        this.state.routeId = false;
        this.loadProductFlow();
    }

    onProductChange(productId) {
        this.state.productId = productId || false;
        if (productId) {
            this.state.categoryId = false;
        }
        this.state.routeId = false;
        this.loadProductFlow();
    }

    onCategoryChange(categoryId) {
        this.state.categoryId = categoryId || false;
        if (categoryId) {
            this.state.productId = false;
        }
        this.state.routeId = false;
        this.loadProductFlow();
    }

    selectRoute(routeId) {
        this.state.routeId = routeId;
    }

    setHovered(ruleId) {
        this.state.hoveredRuleId = ruleId;
    }

    openRule(ruleId) {
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                name: _t("Rule"),
                res_model: "stock.rule",
                res_id: ruleId,
                views: [[false, "form"]],
                target: "new",
            },
            { onClose: () => this.loadData() }
        );
    }

    openLocation(locationId) {
        if (!locationId) {
            return;
        }
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                name: _t("Location"),
                res_model: "stock.location",
                res_id: locationId,
                views: [[false, "form"]],
                target: "new",
            },
            { onClose: () => this.loadData() }
        );
    }

    openRoute() {
        if (!this.state.routeId) {
            return;
        }
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                name: _t("Route"),
                res_model: "stock.route",
                res_id: this.state.routeId,
                views: [[false, "form"]],
                target: "new",
            },
            { onClose: () => this.loadData() }
        );
    }

    newRule() {
        const context = { default_warehouse_id: this.state.warehouseId };
        if (this.state.routeId) {
            context.default_route_id = this.state.routeId;
        }
        this.actionService.doAction(
            {
                type: "ir.actions.act_window",
                name: _t("New Rule"),
                res_model: "stock.rule",
                views: [[false, "form"]],
                target: "new",
                context,
            },
            { onClose: () => this.loadData() }
        );
    }
}

registry.category("actions").add("stock_route_flow", RouteFlow);
