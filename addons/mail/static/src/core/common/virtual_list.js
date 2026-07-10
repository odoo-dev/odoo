import {
    Component,
    onWillUnmount,
    Plugin,
    props,
    proxy,
    signal,
    types,
    useEffect,
    xml,
} from "@odoo/owl";

import { maybePlugin } from "@mail/utils/common/misc";
import { useThrottleForAnimation } from "@web/core/utils/timing";

const DEFAULT_ESTIMATED_ITEM_HEIGHT = 28;

/** Windowing list: renders only the rows in (and just around) the viewport. */
export class VirtualList extends Component {
    static template = xml`
        <div class="o-VirtualList h-100 w-100 overflow-auto o-scrollbar-thin" t-ref="this.scrollContainer">
            <div class="o-VirtualList-sizer position-relative w-100" t-attf-style="height: {{ this.state.totalHeight }}px;">
                <t t-foreach="this.visibleRows" t-as="entry" t-key="entry.key">
                    <div class="o-VirtualList-item position-absolute top-0 start-0 w-100"
                        t-att-data-vlist-key="entry.key"
                        t-attf-style="transform: translateY({{ entry.top }}px);">
                        <t t-call-slot="default" item="entry.item" index="entry.index"/>
                    </div>
                </t>
            </div>
        </div>`;

    scrollContainer = signal(null, { type: types.signal(HTMLElement) });

    setup() {
        super.setup();
        this.items = props.static("items", types.signal(types.array(types.any())));
        this.getItemKey = props.static("getItemKey", types.function([types.any()], types.string()));
        this.estimateItemHeight = props.static(
            "estimateItemHeight",
            types.function([types.any(), types.number()], types.number()).optional()
        );
        // Callbacks for pagination boundaries
        this.onTopScrolled = props.static("onTopScrolled", types.function().optional());
        this.onBottomScrolled = props.static("onBottomScrolled", types.function().optional());

        this.bufferViewports = props.static("bufferViewports", types.number().optional(1));
        this.controller = maybePlugin(VirtualListController);

        /** @type {Map<string, { index: number, height: number|undefined }>} */
        this.metaByKey = new Map();
        this.scrollTop = 0;

        /** Anchoring State tracking for jump-safe updates */
        this.anchorKey = null;
        this.anchorOffsetFromTop = 0;
        this.isStuckToBottom = false;

        // `offsets[i]` is the top of row i; `offsets[n]` is the total height.
        this.state = proxy({ start: 0, end: 0, totalHeight: 0, offsets: [0] });

        this.onScroll = useThrottleForAnimation(() => {
            const el = this.scrollContainer();
            if (!el || this.isEmpty) {
                return;
            }
            this.scrollTop = el.scrollTop;
            // Check if stuck to bottom (with 5px tolerance)
            this.isStuckToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 5;
            // Trigger data loads at thresholds
            if (this.scrollTop < 10) {
                this.onTopScrolled?.();
            }
            if (Math.abs(this.scrollTop + el.clientHeight - el.scrollHeight) < 5) {
                this.onBottomScrolled?.();
            }
            this.updateWindow();
        });

        // Coalesce a burst of resize callbacks into one offset recompute + re-render per frame.
        this.flushHeights = useThrottleForAnimation(() => {
            if (this.isEmpty) {
                return;
            }

            this.preserveScrollAnchor(() => {
                this.computeOffsets();
            });
        });

        this.rowObserver = new ResizeObserver((entries) => this.onRowsResized(entries));

        // Rebuild the size model whenever the list dataset modifications occur (prepend, append, jump)
        useEffect(() => {
            const next = new Map();
            const currentItems = this.items();

            for (let index = 0; index < currentItems.length; index++) {
                const key = this.getItemKey(currentItems[index]);
                next.set(key, { index, height: this.metaByKey.get(key)?.height });
            }
            this.metaByKey = next;

            this.preserveScrollAnchor(() => {
                this.computeOffsets();
            });
        });

        // Track scroll and viewport-size changes on the scroll container.
        useEffect(() => {
            const el = this.scrollContainer();
            if (!el) {
                return;
            }
            this.scrollTop = el.scrollTop;
            this.updateWindow();
            el.addEventListener("scroll", this.onScroll);
            const viewportObserver = new ResizeObserver(() => this.updateWindow());
            viewportObserver.observe(el);
            return () => {
                el.removeEventListener("scroll", this.onScroll);
                viewportObserver.disconnect();
            };
        });

        // Observe the mounted row wrappers to measure their heights.
        useEffect(() => {
            void this.visibleRows.map((row) => row.key);
            const el = this.scrollContainer();
            if (!el) {
                return;
            }
            const wrappers = [...el.querySelectorAll(".o-VirtualList-item")];
            for (const wrapper of wrappers) {
                this.rowObserver.observe(wrapper);
            }
            return () => {
                for (const wrapper of wrappers) {
                    this.rowObserver.unobserve(wrapper);
                }
            };
        });

        useEffect(() => {
            if (!this.controller) {
                return;
            }
            this.controller.handle = this.createHandle();
            return () => (this.controller.handle = null);
        });
        onWillUnmount(() => {
            if (this.controller) {
                this.controller.handle = null;
            }
        });
    }

    get count() {
        return this.state.offsets.length - 1;
    }

    get isEmpty() {
        return this.items().length === 0;
    }

    estimateHeight(item, index) {
        return this.estimateItemHeight
            ? this.estimateItemHeight(item, index)
            : DEFAULT_ESTIMATED_ITEM_HEIGHT;
    }

    heightOf(item, index) {
        return (
            this.metaByKey.get(this.getItemKey(item))?.height ?? this.estimateHeight(item, index)
        );
    }

    get visibleRows() {
        if (this.isEmpty) {
            return [];
        }
        const rows = [];
        const items = this.items();
        for (let i = this.state.start; i < this.state.end; i++) {
            rows.push({
                key: this.getItemKey(items[i]),
                item: items[i],
                index: i,
                top: this.state.offsets[i],
            });
        }
        return rows;
    }

    computeOffsets() {
        if (this.isEmpty) {
            this.state.offsets = [0];
            this.state.totalHeight = 0;
            return;
        }
        const offsets = [0];
        const currentItems = this.items();
        for (let i = 0; i < currentItems.length; i++) {
            offsets[i + 1] = offsets[i] + this.heightOf(currentItems[i], i);
        }
        this.state.offsets = offsets;
        this.state.totalHeight = offsets[currentItems.length];
    }

    indexAt(pos) {
        let lo = 0;
        let hi = this.count;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.state.offsets[mid + 1] <= pos) {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        return lo;
    }

    updateWindow() {
        const el = this.scrollContainer();
        const n = this.count;
        if (!el || n === 0) {
            this.state.start = 0;
            this.state.end = 0;
            return;
        }
        const viewport = el.clientHeight;
        const buffer = viewport * this.bufferViewports;

        const start = this.indexAt(this.scrollTop - buffer);
        const bottom = this.scrollTop + viewport + buffer;
        let end = start;
        while (end < n && this.state.offsets[end] < bottom) {
            end++;
        }
        this.state.start = Math.max(0, start);
        this.state.end = Math.min(n, end);
    }

    /**
     * Executes a layout-altering operation while locking the scroll target
     * onto whatever item the user was currently looking at.
     */
    preserveScrollAnchor(mutationCallback) {
        const el = this.scrollContainer();
        if (!el || this.isEmpty) {
            mutationCallback();
            return;
        }

        // Capture anchor target before state mutations occur
        if (this.isStuckToBottom) {
            // Anchor strategy 1: Lock to bottom edge
            mutationCallback();
            el.scrollTop = el.scrollHeight - el.clientHeight;
        } else {
            // Anchor strategy 2: Lock to top visible element
            const anchorIndex = this.indexAt(el.scrollTop);
            const currentItems = this.items();
            const targetItem = currentItems[anchorIndex];

            if (targetItem) {
                this.anchorKey = this.getItemKey(targetItem);
                this.anchorOffsetFromTop = el.scrollTop - this.state.offsets[anchorIndex];
            }

            mutationCallback();

            // Re-align scroll position using the key's new index coordinate mapping
            const meta = this.metaByKey.get(this.anchorKey);
            if (meta) {
                el.scrollTop = this.state.offsets[meta.index] + this.anchorOffsetFromTop;
            }
        }
        this.scrollTop = el.scrollTop;
        this.updateWindow();
    }

    onRowsResized(entries) {
        if (this.isEmpty) {
            return;
        }
        const items = this.items();
        let dirty = false;

        for (const entry of entries) {
            const key = entry.target.dataset.vlistKey;
            const meta = key === undefined ? undefined : this.metaByKey.get(key);
            if (!meta) {
                continue;
            }
            const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight;
            if (!height) {
                continue;
            }
            const prev = this.heightOf(items[meta.index], meta.index);
            if (prev === height) {
                continue;
            }
            meta.height = height;
            dirty = true;
        }

        if (dirty) {
            this.flushHeights();
        }
    }

    createHandle() {
        const list = this;
        return {
            scrollToItem: (key, options) => list.scrollToItem(key, options),
            scrollToTop: (options) => list.scrollToTop(options),
            scrollToBottom: (options) => list.scrollToBottom(options),
        };
    }

    scrollToTop(options) {
        const el = this.scrollContainer();
        if (el) {
            el.scrollTo({ top: 0, ...options });
        }
    }

    scrollToBottom(options) {
        const el = this.scrollContainer();
        if (el) {
            el.scrollTo({ top: el.scrollHeight, ...options });
        }
    }

    scrollToItem(item, options) {
        const meta = this.metaByKey.get(this.getItemKey(item));
        if (meta) {
            this.scrollToIndex(meta.index, options);
        }
    }
}

export class VirtualListController extends Plugin {
    handle = null;
    scrollToItem(key, options) {
        this.handle?.scrollToItem(key, options);
    }
    scrollToTop(options) {
        this.handle?.scrollToTop(options);
    }
    scrollToBottom(options) {
        this.handle?.scrollToBottom(options);
    }
}
