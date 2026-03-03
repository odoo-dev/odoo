import { expect, test } from "@odoo/hoot";
import { click, queryAll, queryOne } from "@odoo/hoot-dom";
import { startInteractions, setupInteractionWhiteList } from "@web/../tests/public/helpers";
import { onRpc } from "@web/../tests/web_test_helpers";

setupInteractionWhiteList("website.search_results");

test("hybrid load more appends results", async () => {
    onRpc("/website/load_more_search", async (args) => {
        const json = JSON.parse(new TextDecoder().decode(await args.arrayBuffer()));

        expect(json.params.limit).toBe(3);
        const offset = parseInt(json.params.offset);

        if (offset < 6) {
            return [
                `
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 4</a>
                    </li>
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 5</a>
                    </li>
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 6</a>
                    </li>
                `,
                true,
            ];
        }
        else {
            return [
                `
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 7</a>
                    </li>
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 8</a>
                    </li>
                    <li class="o_search_result_item">
                        <a class="o_search_result_link">Item 9</a>
                    </li>
                `,
                false,
            ];
        }
    });

    await startInteractions(`
        <div class="container">
            <input type="search"
                class="search-query"
                data-limit="3"
                value="item"/>

            <input type="hidden"
                class="o_search_order_by"
                value="name asc"/>

            <div class="o_searchbar_result">
                <section id="test">
                    <ul>
                        <li class="o_search_result_item">Item 1</li>
                        <li class="o_search_result_item">Item 2</li>
                        <li class="o_search_result_item">Item 3</li>
                    </ul>
                    <div>
                        <button class="o_load_more"
                                data-search-type="test">
                            Load More
                        </button>
                    </div>
                </section>
            </div>
        </div>
    `);

    const loadMoreButton = queryOne(".o_load_more")
    // Initial state
    expect(queryAll(".o_search_result_item")).toHaveLength(3);

    await click(loadMoreButton);
    expect(queryAll(".o_search_result_item")).toHaveLength(6);
    // offset should be updated
    expect(loadMoreButton).toHaveAttribute("data-offset", "6")

    await click(loadMoreButton);
    expect(queryAll(".o_search_result_item")).toHaveLength(9);
    // Button should be hidden
    expect(loadMoreButton.classList.contains("d-none")).toBe(true);
});

