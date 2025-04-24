import {
    Component,
    onWillUpdateProps,
    useEffect,
    useExternalListener,
    useRef,
    useState,
} from "@odoo/owl";
import { Dropdown } from "@web/core/dropdown/dropdown";
import { DropdownItem } from "@web/core/dropdown/dropdown_item";

/**
 * A notebook component that will render only the current page and allow
 * switching between its pages.
 *
 * You can also set pages using a template component. Use an array with
 * the `pages` props to do such rendering.
 *
 * Pages can also specify their index in the notebook.
 *
 *      e.g.:
 *          PageTemplate.template = xml`
                    <h1 t-esc="props.heading" />
                    <p t-esc="props.text" />`;

 *      `pages` could be:
 *      [
 *          {
 *              Component: PageTemplate,
 *              id: 'unique_id' // optional: can be given as defaultPage props to the notebook
 *              index: 1 // optional: page position in the notebook
 *              name: 'some_name' // optional
 *              title: "Some Title 1", // title displayed on the tab pane
 *              props: {
 *                  heading: "Page 1",
 *                  text: "Text Content 1",
 *              },
 *          },
 *          {
 *              Component: PageTemplate,
 *              title: "Some Title 2",
 *              props: {
 *                  heading: "Page 2",
 *                  text: "Text Content 2",
 *              },
 *          },
 *      ]
 *
 * <Notebook pages="pages">
 *    <t t-set-slot="Page Name 1" title="Some Title" isVisible="bool">
 *      <div>Page Content 1</div>
 *    </t>
 *    <t t-set-slot="Page Name 2" title="Some Title" isVisible="bool">
 *      <div>Page Content 2</div>
 *    </t>
 * </Notebook>
 *
 * @extends Component
 */

function isElementInViewport(el) {
    const rect = el.getBoundingClientRect();
    const width = window.innerWidth || document.documentElement.clientWidth;
    const height = window.innerHeight || document.documentElement.clientHeight;
    return (
        Math.round(rect.top) >= 0 &&
        Math.round(rect.left) >= 0 &&
        Math.round(rect.right) <= width &&
        Math.round(rect.bottom) <= height
    );
}

const show = (...els) => els.forEach((el) => el.classList.remove("d-none"));

export class Notebook extends Component {
    static components = {
        Dropdown,
        DropdownItem,
    };
    static template = "web.Notebook";
    static defaultProps = {
        className: "",
        orientation: "horizontal",
        onPageUpdate: () => {},
    };
    static props = {
        slots: { type: Object, optional: true },
        pages: { type: Object, optional: true },
        class: { optional: true },
        className: { type: String, optional: true },
        defaultPage: { type: String, optional: true },
        orientation: { type: String, optional: true },
        icons: { type: Object, optional: true },
        onPageUpdate: { type: Function, optional: true },
    };

    setup() {
        this.rootRef = useRef("root");
        this.activePane = useRef("activePane");
        this.hiddenTabsToggle = useRef("hiddenTabsToggle");
        this.pages = this.computePages(this.props);
        this.state = useState({ currentPage: null });
        this.state.currentPage = this.computeActivePage(this.props.defaultPage, true);
        useEffect(
            () => {
                this.props.onPageUpdate(this.state.currentPage);
                this.activePane.el?.classList.add("show");
                this.adjustVisibleNavItems();
            },
            () => [this.state.currentPage]
        );
        onWillUpdateProps((nextProps) => {
            const activateDefault =
                this.props.defaultPage !== nextProps.defaultPage || !this.defaultVisible;
            this.pages = this.computePages(nextProps);
            this.state.currentPage = this.computeActivePage(nextProps.defaultPage, activateDefault);
        });

        this.hiddenTabs = [];
        useExternalListener(window, "resize", () => this.adjustVisibleNavItems());
    }

    get navItems() {
        return this.pages.filter((e) => e[1].isVisible);
    }

    get page() {
        const page = this.pages.find((e) => e[0] === this.state.currentPage)[1];
        return page.Component && page;
    }

    adjustVisibleNavItems() {
        const itemEls = [...this.rootRef.el.querySelectorAll("li.nav-item")];
        const selectedIndex = itemEls.findIndex((el) =>
            el.firstElementChild.classList.contains("active")
        );
        show(...itemEls, this.hiddenTabsToggle.el);
        this.hiddenTabs = [];
        for (let i = 0; i < itemEls.length; i++) {
            if (!isElementInViewport(itemEls[i])) {
                let indexToHide = i;
                if (i === selectedIndex) {
                    indexToHide = i - 1;
                }
                itemEls[indexToHide].classList.add("d-none");
                const link = itemEls[indexToHide].firstElementChild;
                this.hiddenTabs.push({ name: link.name, string: link.textContent });
            }
        }
        if (!this.hiddenTabs.length) {
            this.hiddenTabsToggle.el.classList.add("d-none");
        }
    }

    activatePage(pageIndex) {
        if (!this.disabledPages.includes(pageIndex) && this.state.currentPage !== pageIndex) {
            this.activePane.el?.classList.remove("show");
            this.state.currentPage = pageIndex;
        }
    }

    computePages(props) {
        if (!props.slots && !props.pages) {
            return [];
        }
        if (props.pages) {
            for (const page of props.pages) {
                page.isVisible = true;
            }
        }
        this.disabledPages = [];
        const pages = [];
        const pagesWithIndex = [];
        for (const [k, v] of Object.entries({ ...props.slots, ...props.pages })) {
            const id = v.id || k;
            if (v.index) {
                pagesWithIndex.push([id, v]);
            } else {
                pages.push([id, v]);
            }
            if (v.isDisabled) {
                this.disabledPages.push(k);
            }
        }
        for (const page of pagesWithIndex) {
            pages.splice(page[1].index, 0, page);
        }
        return pages;
    }

    computeActivePage(defaultPage, activateDefault) {
        if (!this.pages.length) {
            return null;
        }
        const pages = this.pages.filter((e) => e[1].isVisible).map((e) => e[0]);

        if (defaultPage) {
            if (!pages.includes(defaultPage)) {
                this.defaultVisible = false;
            } else {
                this.defaultVisible = true;
                if (activateDefault) {
                    return defaultPage;
                }
            }
        }
        const current = this.state.currentPage;
        if (!current || (current && !pages.includes(current))) {
            return pages[0];
        }

        return current;
    }
}
