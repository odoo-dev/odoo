import {
    Component,
    onMounted,
    onWillStart,
    onWillUnmount,
    usePlugin,
    proxy,
    t,
    useProps,
} from "@odoo/owl";
import { OfflinePlugin } from "@web/core/offline/offline_plugin";
import { browser } from "@web/core/browser/browser";
import { useService } from "@web/core/utils/hooks";
import { useDebounced } from "@web/core/utils/timing";
import { useEnv } from "@web/owl2/utils";
import { DEFAULT_GROUPBY_ID } from "@web/search/search_model";

export class SearchBarToggler extends Component {
    static template = "web.SearchBar.Toggler";
    props = useProps({
        isSmall: t.boolean(),
        showSearchBar: t.boolean(),
        toggleSearchBar: t.function(),
    });
}

export class OfflineSearchBarToggler extends SearchBarToggler {
    static template = "web.SearchBar.Toggler.Offline";
    setup() {
        const offlinePlugin = usePlugin(OfflinePlugin);
        onWillStart(async () => {
            const { actionId, viewType } = this.env.config;
            const availableSearches = await offlinePlugin.getAvailableSearches(actionId, viewType);
            this.isDisabled = Object.keys(availableSearches).length <= 1;
        });
    }
}

export function useSearchBarToggler() {
    const ui = useService("ui");
    const { searchModel } = useEnv();

    // on small screens, the search bar is expanded by default if the search is active when
    // the view is opened (e.g. default filters or favorite), so that the user is aware of it
    // (the default group by of the view doesn't count, as it is visible in the view anyway)
    let isToggled = Boolean(
        searchModel?.facets.some((facet) => facet.groupId !== DEFAULT_GROUPBY_ID)
    );
    const state = proxy({
        isSmall: ui.isSmall,
        showSearchBar: false,
    });
    const updateState = () => {
        state.isSmall = ui.isSmall;
        state.showSearchBar = !ui.isSmall || isToggled;
    };
    updateState();

    function toggleSearchBar() {
        isToggled = !isToggled;
        updateState();
    }

    const onResize = useDebounced(updateState, 200);
    onMounted(() => {
        browser.addEventListener("resize", onResize);
    });
    onWillUnmount(() => browser.removeEventListener("resize", onResize));

    return {
        state,
        component: SearchBarToggler,
        offlineComponent: OfflineSearchBarToggler,
        get props() {
            return {
                isSmall: state.isSmall,
                showSearchBar: state.showSearchBar,
                toggleSearchBar,
            };
        },
    };
}
