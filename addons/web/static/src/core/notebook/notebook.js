/** @odoo-module **/

import { scrollTo } from "@web/core/utils/scrolling";

const { Component, onWillUpdateProps, useEffect, useRef, useState } = owl;

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
                    <h1 t-esc="props.title" />
                    <p t-esc="props.text" />`;

 *      `pages` could be:
 *      [
 *          {
 *              Component: PageTemplate,
 *              props: {
 *                  title: "Some Title 1",
 *                  isVisible: bool,
 *                  text: "Text Content 1",
 *              },
 *              name: 'some_name' // optional
 *          },
 *          {
 *              Component: PageTemplate,
 *              props: {
 *                  title: "Some Title 2",
 *                  isVisible: bool,
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

export class Notebook extends Component {
    setup() {
        this.activePane = useRef("activePane");
        this.anchorTarget = null;
        this.pages = this.computePages(this.props);
        this.state = useState({ currentPage: null });
        this.state.currentPage = this.props.defaultPage || this.computeActivePage();
        this.env.bus.addEventListener("SCROLLER:ANCHOR_LINK_CLICKED", (ev) =>
            this.onAnchorClicked(ev)
        );
        useEffect(
            () => {
                this.props.onPageUpdate(this.state.currentPage);
                if (this.anchorTarget) {
                    const matchingEl = this.activePane.el.querySelector(`#${this.anchorTarget}`);
                    scrollTo(matchingEl, { isAnchor: true });
                    this.anchorTarget = null;
                }
            },
            () => [this.state.currentPage]
        );
        onWillUpdateProps((nextProps) => {
            this.pages = this.computePages(nextProps);
            this.state.currentPage = this.computeActivePage();
        });
    }

    get navItems() {
        return this.pages.filter((e) => e[1].isVisible);
    }

    get page() {
        const page = this.pages.find((e) => e[0] === this.state.currentPage)[1];
        return page.Component && page;
    }

    onAnchorClicked(ev) {
        if (!this.props.anchors) return;
        const id = ev.detail.detail.id.substring(1);
        if (this.props.anchors[id]) {
            if (this.state.currentPage !== this.props.anchors[id].target) {
                ev.preventDefault();
                ev.detail.detail.originalEv.preventDefault();
                this.anchorTarget = id;
                this.state.currentPage = this.props.anchors[id].target;
            }
        }
    }

    computePages(props) {
        if (!props.slots && !props.pages) {
            return [];
        }
        const pages = [];
        const pagesWithIndex = [];
        for (const [k, v] of Object.entries({ ...props.slots, ...props.pages })) {
            if (v.props) {
                v.isVisible = v.props.isVisible;
                v.title = v.props.title;
                v.index = v.props.index;
            }
            const name = v.name ? v.name : k;
            v.index ? pagesWithIndex.push([name, v]) : pages.push([name, v]);
        }
        for (const page of pagesWithIndex) {
            pages.splice(page[1].index, 0, page);
        }
        return pages;
    }

    computeActivePage() {
        if (!this.pages.length) {
            return null;
        }
        const current = this.state.currentPage;
        if (!current || (current && !this.pages.find((e) => e[0] === current)[1].isVisible)) {
            const candidate = this.pages.find((v) => v[1].isVisible);
            return candidate ? candidate[0] : null;
        }
        return current;
    }
}

Notebook.template = "web.Notebook";
Notebook.defaultProps = {
    className: "",
    orientation: "horizontal",
    onPageUpdate: () => {},
};
Notebook.props = {
    slots: { type: Object, optional: true },
    pages: { type: Object, optional: true },
    class: { optional: true },
    className: { type: String, optional: true },
    anchors: { type: Object, optional: true },
    defaultPage: { type: String, optional: true },
    orientation: { type: String, optional: true },
    onPageUpdate: { type: Function, optional: true },
};
