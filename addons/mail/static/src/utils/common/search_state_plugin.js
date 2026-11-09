import { useSequential } from "@mail/utils/common/hooks";

import {
    computed,
    onWillDestroy,
    Plugin,
    signal,
    t,
    useConfig,
    useOnChange,
    useScope,
} from "@odoo/owl";

import { batched } from "@web/core/utils/timing";

/**
 * Shared search state with optional async fetch and sync local lookup.
 *
 * Config (all optional):
 * - `deps`: function returning extra reactive dependencies that re-run the search.
 * - `fetch`: async function fetching results for the term, with an abort signal.
 * - `filter`: function returning local results for the term.
 * - `initialResults`: results used on reset, defaults to an empty array.
 * - `isActive`: predicate overriding the default non-empty-term check.
 * - `searchTerm`: parent-owned signal for the term, defaults to a local signal.
 */
export class SearchStatePlugin extends Plugin {
    _loading = signal(false);
    /** @type {import("@odoo/owl").Signal<any>} */
    _results = signal();
    _searching = signal(false);
    /** @type {import("@odoo/owl").Signal<string>} from the `searchTerm` config, else local */
    _searchTerm = signal("");
    /** @type {(() => any[]) | undefined} Extra dependencies that re-run the search when changed. */
    depsGetter = useConfig("deps", t.function([], t.array()).optional());
    deps = computed(() => this.depsGetter?.() ?? []);
    /**
     * @type {((term: string, options: { abortSignal: AbortSignal }) => Promise<boolean | void>) | undefined}
     * Next fetch aborts the signal; `false` skips narrower terms until deps change or reset.
     */
    fetch = useConfig(
        "fetch",
        t
            .function(
                [t.string(), t.object({ abortSignal: t.instanceOf(AbortSignal) })],
                t.promise(t.boolean().optional())
            )
            .optional()
    );
    /**
     * @type {((term: string) => any) | undefined}
     * Local lookup on term/deps changes (once per animation frame) and after fetch.
     */
    filter = useConfig("filter", t.function([t.string()], t.any()).optional());
    /** Value assigned to `results` on reset. Defaults to a fresh empty array. */
    initialResults = useConfig(
        "initialResults",
        t.any().optional(() => [])
    );
    /** @type {(() => boolean) | undefined} Overrides the default non-empty-term check. */
    isActiveGetter = useConfig("isActive", t.function([], t.boolean()).optional());
    isActive = computed(() => (this.isActiveGetter ? this.isActiveGetter() : !!this.searchTerm));
    /** @type {string | undefined} */
    lastEmptyTerm;
    /** Whether {@link _searchTerm} is ours to clear, i.e. not the parent's. */
    ownsSearchTerm = true;
    /** @type {Function | undefined} */
    sequential;

    setup() {
        const searchTerm = useConfig("searchTerm", t.signal(t.string()).optional());
        if (searchTerm) {
            this._searchTerm = searchTerm;
            this.ownsSearchTerm = false;
        }
        this.results = this.initialResults;
        this.sequential = useSequential();
        const scope = useScope();
        // once per animation frame, like the rendering: searching on each change
        // (e.g. each typed character) would fetch every intermediate term
        const update = batched(
            () => {
                if (scope.isDestroyed()) {
                    return;
                }
                if (!this.isActive()) {
                    this.reset();
                    return;
                }
                if (this.filter) {
                    this.results = this.filter(this.searchTerm);
                }
                this.run();
            },
            () => new Promise((resolve) => requestAnimationFrame(resolve))
        );
        useOnChange(
            () => this.deps(),
            () => {
                this.lastEmptyTerm = undefined;
            }
        );
        useOnChange(
            () => [this.searchTerm, ...this.deps()],
            () => {
                update();
            }
        );
        onWillDestroy(() => this.reset());
    }

    get loading() {
        return this._loading();
    }

    set loading(value) {
        this._loading.set(value);
    }

    get results() {
        return this._results();
    }

    set results(value) {
        this._results.set(value);
    }

    get searching() {
        return this._searching();
    }

    set searching(value) {
        this._searching.set(value);
    }

    get searchTerm() {
        return this._searchTerm();
    }

    set searchTerm(value) {
        this._searchTerm.set(value);
    }

    reset() {
        if (this.ownsSearchTerm) {
            this.searchTerm = "";
        }
        this.searching = false;
        this.loading = false;
        this.results = this.initialResults;
        this.lastEmptyTerm = undefined;
    }

    async run({ skipFetch = false } = {}) {
        if (!this.isActive()) {
            this.reset();
            return;
        }
        const term = this.searchTerm;
        this.searching = true;
        if (this.lastEmptyTerm !== undefined && term.startsWith(this.lastEmptyTerm)) {
            // Broader term already had no results, so the narrower term
            // can't either: skip both the fetch and the local filter.
            return;
        }
        if (this.fetch && !skipFetch) {
            await this.sequential(async (abortSignal) => {
                if (!this.isActive()) {
                    return;
                }
                this.loading = true;
                let result;
                try {
                    result = await this.fetch(term, { abortSignal });
                } catch (e) {
                    if (!abortSignal.aborted) {
                        throw e;
                    }
                } finally {
                    if (this.searchTerm === term) {
                        this.loading = false;
                    }
                }
                if (this.searchTerm === term) {
                    if (this.filter) {
                        this.results = this.filter(term);
                    }
                    this.lastEmptyTerm = result === false ? term : undefined;
                }
            });
        } else if (this.filter) {
            this.results = this.filter(term);
        }
    }
}
