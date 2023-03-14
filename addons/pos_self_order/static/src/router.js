/** @odoo-module */

import { Component, useState, useSubEnv, xml } from "@odoo/owl";
import { escapeRegExp } from "@web/core/utils/strings";
import { browser } from "@web/core/browser/browser";
import { zip } from "@web/core/utils/arrays";

function parseParams(matches, paramSpecs) {
    return Object.fromEntries(
        zip(matches, paramSpecs).map(([match, paramSpec]) => {
            const { type, name } = paramSpec;
            switch (type) {
                case "int":
                    return [name, parseInt(match)];
                case "string":
                    return [name, match];
                default:
                    throw new Error(`Unknown type ${type}`);
            }
        })
    );
}
export class Router extends Component {
    static template = xml`<t t-slot="{{state.activeSlot}}" t-props="state.slotProps"/>`;
    setup() {
        useSubEnv({ navigate });
        this.state = useState({
            activeSlot: "default",
            slotProps: {},
        });
        window.addEventListener("self_order_navigate", () => {
            this.matchURL();
        });
        // this is needed for the back button to work
        window.addEventListener("popstate", (event) => {
            this.matchURL();
        });
        this.routes = Object.keys(this.props.slots).map((route) => {
            const paramStrings = route.match(/\{\w+:\w+\}/g);
            if (!paramStrings) {
                return { route, paramSpecs: [], regex: new RegExp(`^${route}$`) };
            }
            const paramSpecs = paramStrings.map((paramString) => {
                const [, type, name] = paramString.match(/(\w+):(\w+)/);
                return { type, name };
            });
            const regex = new RegExp(
                `^${route
                    .split(/\{\w+:\w+\}/)
                    .map((part) => escapeRegExp(part))
                    .join("(.*)?")}$`
            );
            return { route, paramSpecs, regex };
        });
        this.matchURL();
    }

    matchURL() {
        const path = browser.location.pathname;
        for (const { route, paramSpecs, regex } of this.routes) {
            const match = path.match(regex);
            if (match) {
                const parsedParams = parseParams(match.slice(1), paramSpecs);
                this.state.activeSlot = route;
                this.state.slotProps = parsedParams;
                return;
            }
        }
        this.state.activeSlot = "default";
        this.state.slotProps = {};
    }
}

export function navigate(route) {
    const url = new URL(browser.location.href);
    url.pathname = "/menu" + route;
    history.pushState({}, "", url);
    window.dispatchEvent(new Event("self_order_navigate"));
}
