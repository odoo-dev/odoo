import { Interaction } from "@web/public/interaction";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";
import { redirect } from "@web/core/utils/urls";
import { markup } from "@odoo/owl";
import { setElementContent } from "@web/core/utils/html";

export function sendRequest(route, params) {
    function _addInput(form, name, value) {
        const param = document.createElement("input");
        param.setAttribute("type", "hidden");
        param.setAttribute("name", name);
        param.setAttribute("value", value);
        form.appendChild(param);
    }

    const form = document.createElement("form");
    form.setAttribute("action", route);
    form.setAttribute("method", params.method || "POST");
    // This is an exception for the 404 page create page button, in backend we
    // want to open the response in the top window not in the iframe.
    if (params.forceTopWindow) {
        form.setAttribute("target", "_top");
    }

    if (odoo.csrf_token) {
        _addInput(form, "csrf_token", odoo.csrf_token);
    }

    for (const key in params) {
        const value = params[key];
        if (Array.isArray(value) && value.length) {
            for (const val of value) {
                _addInput(form, key, val);
            }
        } else {
            _addInput(form, key, value);
        }
    }

    document.body.appendChild(form);
    form.submit();
}
export class PostLink extends Interaction {
    static selector = ".post_link";
    dynamicSelectors = {
        ...this.dynamicSelectors,
        // Distinguish _root according to node type.
        _select: () => this.el.matches("select") && this.el,
        _nonSelect: () => !this.el.matches("select") && this.el,
    };
    dynamicContent = {
        _root: {
            "t-att-class": () => ({
                o_post_link_js_loaded: true,
            }),
        },
        _nonSelect: {
            "t-on-click.prevent": this.onClickPost,
        },
        _select: {
            // In some browsers the click event is triggered when opening the select.
            "t-on-change.prevent": this.onClickPost,
        },
    };

    onClickPost() {
        const data = {};
        for (const [key, value] of Object.entries(this.el.dataset)) {
            if (key.startsWith("post_")) {
                data[key.slice(5)] = value;
            }
        }
        sendRequest(this.el.dataset.post || this.el.href || this.el.value, data);
    }
}

// ─── Async offcanvas filter ───────────────────────────────────────────────────
//
// Generic interaction driven entirely by data attributes on .o_async_filters.
// Mirrors the shop PR's updateShopContent pattern — fires on every input change,
// swaps content regions in place, keeps offcanvas open.
//
// Data attributes on .o_async_filters (.o_website_offcanvas):
//
//   data-filter-url               base URL (e.g. "/event", "/jobs", "/slides")
//   data-filter-clear-url         URL for Clear Filters
//   data-filter-reload-route      JSON-RPC endpoint (e.g. "/event/reload")
//   data-filter-root-selector     root el for stopInteractions/startInteractions
//   data-filter-loading-selector  el to dim with opacity-50 while loading
//   data-filter-replace-selectors comma-separated selectors to swap from response
//   data-filter-count-selector    selector of the count badge in Apply button

/**
 * Collects active filter values from all named inputs in the offcanvas body.
 *
 * Multiple checked checkboxes with the same name are comma-joined into one
 * value — this handles both event tags (name="tags") and slide tags (name="tag")
 * which both allow multiple simultaneous selections.
 *
 * Radio inputs carrying an encoded "key=value" string (used in jobs filters,
 * e.g. "department_id=3") are split and added as individual params.
 */
function collectFilterParams(offcanvasEl) {
    const params = {};
    // Accumulate multi-select values per name before joining.
    const multiValues = {};

    for (const inputEl of offcanvasEl.querySelectorAll(".offcanvas-body input[name]")) {
        if (inputEl.disabled) {
            continue;
        }
        const isToggle = inputEl.type === "checkbox" || inputEl.type === "radio";
        if (isToggle && !inputEl.checked) {
            continue;
        }
        if (!inputEl.value) {
            continue;
        }
        // Radio values can encode a full "key=value" param string (jobs filters).
        if (inputEl.type === "radio" && inputEl.value.includes("=")) {
            const [[key, val]] = new URLSearchParams(inputEl.value).entries();
            if (key && val) {
                params[key] = val;
            }
            continue;
        }
        // Checkboxes (and normal radios) accumulate slugs per name,
        // then join as comma-separated — matches what the controllers expect.
        const slug = inputEl.dataset.slug || inputEl.value;
        if (!multiValues[inputEl.name]) {
            multiValues[inputEl.name] = [];
        }
        multiValues[inputEl.name].push(slug);
    }

    // Join multi-values into comma-separated strings.
    for (const [name, values] of Object.entries(multiValues)) {
        params[name] = values.join(",");
    }

    return params;
}

/**
 * Calls the reload endpoint and swaps all configured DOM regions in place.
 * Mirrors shop's updateShopContent exactly:
 *   dim → rpc → stopInteractions → swap regions → pushState → startInteractions → undim
 *
 * Falls back to redirect() on RPC failure.
 */
async function updateFilteredContent(interaction, offcanvasEl, extraParams = {}) {
    const reloadRoute = offcanvasEl.dataset.filterReloadRoute;
    if (!reloadRoute) {
        return;
    }

    const params = { ...collectFilterParams(offcanvasEl), ...extraParams };

    // Dim the loading region while waiting — mirrors shop's opacity-50.
    const loadingEl = document.querySelector(offcanvasEl.dataset.filterLoadingSelector);
    loadingEl?.classList.add("opacity-50");

    // Build target URL from base + collected params for pushState.
    const targetUrl = new URL(offcanvasEl.dataset.filterUrl, window.location.origin);
    for (const [key, value] of Object.entries(params)) {
        if (key !== "prevent_redirect") {
            targetUrl.searchParams.set(key, value);
        }
    }

    try {
        const data = await interaction.waitFor(rpc(reloadRoute, params));

        const updatedPage = document.createElement("div");
        setElementContent(updatedPage, markup(data.html));

        const rootEl =
            document.querySelector(offcanvasEl.dataset.filterRootSelector) ||
            document.querySelector("#wrapwrap") ||
            document.body;

        interaction.services["public.interactions"].stopInteractions(rootEl);

        // Swap every region listed in data-filter-replace-selectors.
        for (const selector of (offcanvasEl.dataset.filterReplaceSelectors || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)) {
            const newEl = updatedPage.querySelector(selector);
            const currentEl = document.querySelector(selector);
            if (newEl && currentEl) {
                setElementContent(currentEl, markup(newEl.innerHTML));
            }
        }

        // Update live result count on the Apply button.
        const countEl = offcanvasEl.dataset.filterCountSelector
            ? document.querySelector(offcanvasEl.dataset.filterCountSelector)
            : null;
        if (countEl) {
            setElementContent(countEl, String(data.count ?? 0));
        }

        history.pushState({}, "", targetUrl.pathname + targetUrl.search);
        loadingEl?.classList.remove("opacity-50");
        interaction.services["public.interactions"].startInteractions(rootEl);
    } catch {
        redirect(targetUrl.pathname + targetUrl.search);
    }
}

/**
 * Async mobile offcanvas filter — attaches to .o_async_filters.
 *
 * Every input change fires the reload RPC immediately, swapping content
 * regions and offcanvas body in place. The offcanvas stays open so the user
 * can keep selecting options and see live counts update. Apply (data-bs-dismiss)
 * just closes — identical to the shop PR's onChangeAttribute flow.
 */
export class AsyncFilters extends Interaction {
    static selector = ".o_async_filters";

    dynamicContent = {
        ".offcanvas-body input": {
            "t-on-change": this.onFilterChange,
        },
        ".o_async_filters_clear": {
            "t-on-click.prevent": this.onClearFilters,
        },
    };

    onFilterChange() {
        updateFilteredContent(this, this.el);
    }

    onClearFilters() {
        redirect(
            this.el.dataset.filterClearUrl || this.el.dataset.filterUrl || window.location.pathname
        );
    }
}

registry.category("public.interactions").add("website.post_link", PostLink);
registry.category("public.interactions").add("website.async_filters", AsyncFilters);
