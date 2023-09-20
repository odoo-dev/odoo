/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { subscribeToURLParams } from "../core/url";
import { MarkupHelper, compactXML, debounce, match } from "../utils";
import { HootStatusPanel } from "./hoot_status_panel";
import { HootTestResult } from "./hoot_test_result";

/**
 * @typedef {import("../core/test").Test} Test
 */

/**
 * @template {(...args: any[]) => any} T
 * @param {T} fn
 * @param {number} interval
 * @returns {T}
 */
const batch = (fn, interval) => {
    /** @type {T[]} */
    const currentBatch = [];
    const name = `${fn.name} (batched)`;
    let timeoutId = 0;
    return {
        [name](...args) {
            currentBatch.push(() => fn(...args));
            if (timeoutId) {
                return;
            }
            timeoutId = setTimeout(() => {
                while (currentBatch.length) {
                    currentBatch.pop()();
                }
                timeoutId = 0;
            }, interval);
        },
    }[name];
};

/** @extends Component<{}, import("../hoot").Environment> */
export class HootReporting extends Component {
    static components = { HootStatusPanel, HootTestResult };

    static template = compactXML/* xml */ `
        <div class="hoot-reporting hoot-col">
            <HootStatusPanel
                filter="state.filter"
                filterResults.bind="filterResults"
                grouped="state.grouped"
                groupResults.bind="groupResults"
                sorted="state.sorted"
                sortResults.bind="sortResults"
            />
            <div class="hoot-results">
                <t t-foreach="getFilteredResults()" t-as="result" t-key="result.id">
                    <t t-if="result.group">
                    </t>
                    <t t-else="">
                        <HootTestResult test="result.test" open="state.open.includes(result.test.id)" />
                    </t>
                </t>
            </div>
        </div>
    `;

    debouncedOnScroll = debounce(() => this.onScroll(), 16);

    setup() {
        const { runner } = this.env;

        subscribeToURLParams("showskipped", "showpassed");

        this.state = useState({
            filter: null,
            grouped: false,
            /** @type {string[]} */
            open: [],
            sorted: false,
            /** @type {Record<string, Test>} */
            tests: {},
        });

        const addTest = batch((test) => (this.state.tests[test.id] = test), 100);

        let didShowDetail = false;
        const { showdetail } = this.env.runner.config;
        runner.afterAnyTest((test) => {
            addTest(test);
            if (
                showdetail &&
                !(showdetail === "first-fail" && didShowDetail) &&
                !test.skip &&
                !test.lastResults.pass
            ) {
                didShowDetail = true;
                this.state.open.push(test.id);
            }
        });
        runner.skippedAnyTest(addTest);
    }

    filterResults(filter) {
        this.state.filter = this.state.filter === filter ? null : filter;
    }

    getFilteredResults() {
        if (!this.state) return [];

        const makeResult = ({ group, test }) =>
            group ? { group, id: `group#${group.id}` } : { test, id: `test#${test.id}` };

        const { showskipped, showpassed } = this.env.runner.config;
        const { filter, grouped, sorted, tests } = this.state;

        const groups = sorted ? {} : [];
        for (const test of Object.values(tests)) {
            let matchFilter = false;
            switch (filter) {
                case "failed": {
                    matchFilter = !test.config.skip && test.results.some((r) => !r.pass);
                    break;
                }
                case "passed": {
                    matchFilter = !test.config.skip && test.results.every((r) => r.pass);
                    break;
                }
                case "skipped": {
                    matchFilter = test.config.skip;
                    break;
                }
                default: {
                    if (!showskipped && test.config.skip) {
                        matchFilter = false;
                    } else if (!showpassed && test.results.every((r) => r.pass)) {
                        matchFilter = false;
                    } else {
                        matchFilter = true;
                    }
                    break;
                }
            }
            if (!matchFilter) {
                continue;
            }

            if (sorted) {
                const key = test.lastResults?.duration || 0;
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(makeResult({ test }));
            } else {
                groups.push(makeResult({ test }));
            }
        }

        if (sorted) {
            const values = Object.values(groups).flat();
            return sorted === "asc" ? values : values.reverse();
        } else {
            return groups;
        }
    }

    groupResults() {
        this.state.grouped = !this.state.grouped;
    }

    sortResults() {
        if (!this.state.sorted) {
            this.state.sorted = "desc";
        } else if (this.state.sorted === "desc") {
            this.state.sorted = "asc";
        } else {
            this.state.sorted = false;
        }
    }
}
