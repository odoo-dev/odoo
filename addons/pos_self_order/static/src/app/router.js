import { Component, onWillRender, xml } from "@odoo/owl";
import { escapeRegExp } from "@web/core/utils/strings";
import { zip } from "@web/core/utils/arrays";
import { useService } from "@web/core/utils/hooks";

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
    static props = { slots: Object, pos_config_id: Number };
    static template = xml`<t t-slot="{{activeSlot}}" t-props="slotProps"/>`;

    setup() {
        this.router = useService("router");
        this.activeSlot = "default";
        this.slotProps = {};
        this.routes = {};
        const lgPrefixRegex = "^(?:/([a-zA-Z]{2}(?:_[a-zA-Z]{2})?))?"; // optional language code: e.g. fr/ or fr_be/

        for (const [routeName, slot] of Object.entries(this.props.slots)) {
            const route = slot.route;

            const paramSpecs = (route.match(/\{\w+:\w+\}/g) || []).map((m) => {
                const [, type, name] = m.match(/(\w+):(\w+)/);
                return { type, name };
            });

            /* Build a regex to match self-ordering routes with table identifiers avaialble or not.
                Examples:
                    /pos-self/<token>
                    /pos-self/<token>/<tableIdentifiers>
                    /pos-self/<token>/products
                    /pos-self/<token>/<tableIdentifiers>/products
                Dynamic parts like `{string:id}` become `([^/]+)` capture groups.
            */
            const tokenMatch = route.match(/^\/pos-self\/([^/]+)/);

            const pattern =
                lgPrefixRegex +
                (tokenMatch
                    ? escapeRegExp(tokenMatch[0]) +
                      "(?:/[^/]+)?" +
                      route
                          .slice(tokenMatch[0].length)
                          .split(/\{\w+:\w+\}/)
                          .map(escapeRegExp)
                          .join("([^/]+)")
                    : route
                          .split(/\{\w+:\w+\}/)
                          .map(escapeRegExp)
                          .join("([^/]+)")) +
                "/?$";

            this.routes[routeName] = {
                route,
                paramSpecs,
                regex: new RegExp(pattern),
            };
        }

        this.router.registerRoutes(this.routes);

        onWillRender(() => {
            this.matchURL();
        });
    }

    matchURL() {
        const path = this.router.path;

        const routes = Object.entries(this.routes).sort(
            (a, b) => b[1].regex.source.length - a[1].regex.source.length
        );
        for (const [routeName, { paramSpecs, regex }] of routes) {
            const match = path.match(regex);
            if (match) {
                const parsedParams = parseParams(match.slice(2), paramSpecs);
                this.router.activeSlot = routeName;
                this.activeSlot = routeName;
                this.slotProps = parsedParams;
                return;
            }
        }

        this.router.activeSlot = "default";
        this.router.navigate("default");
    }
}
