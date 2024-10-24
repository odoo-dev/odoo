# Public Widgets

## Motivation

- try to harmonize web client and website code
- maybe: make use of owl components in website (not sure that is what we want)
- make it obvious how to use services (useService)
- and hooks (call the hook)
- have a well defined lifecycle
- better design: we don't want to have "editor.pause/startobserver" in code

## New API

Simple usecase, no component?

```js

    class BaseServiceTruc {
        ...
    }
  registry.category("website_element").add("crm.mycomponent", {
    selector: "someselector",
    start(el, services, env) {
        return new BaseServiceTrc(...)
        

        // if we want to cleanup/stop something, return a stop function
        return () => {
            // some cleanup
        }
    }
  });
```

```js
class PublicWidget {
    constructor(el) {
        this.el =e l;
    }

    start() [

    ]

    mountComponent() {}

    destroy() {

    }
}

class PortalLoyalty extends PublicWidget {

    doSomtehing() {
        this.mountComponent(DIalog, "....");
    }
}


registry.category("website_element").add("crm.mycomponent", 
```

Mount a component at some specific location (will mount component as first
child of selector)

```js
  registry.category("website_element").add("crm.mycomponent", {
    selector: "someselector",
    Component: MyComponent,
  });
```

Mount a component at some specific location (will mount component as first
child of selector)

```js
  registry.category("website_element").add("crm.mycomponent", {
    selector: "someselector",
    Component: MyComponent,
    position: "attach", // or "replace_content", "replace_element", "first-child"
  });
```

## Example

Initial widget:

```js
import publicWidget from '@web/legacy/js/public/public_widget';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

publicWidget.registry.PortalLoyaltyWidget = publicWidget.Widget.extend({
    selector: '.o_loyalty_container',
    events: {
        'click .o_loyalty_card': '_onClickLoyaltyCard',
    },

    async _onClickLoyaltyCard(ev) {
        const card_id = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${card_id}/values`);
        this.call("dialog", "add", PortalLoyaltyCardDialog, data);
    },
});
```

Version 1:
```js
import { registry } from '@web/core/registry';
import { Component } from '@odoo/owl';
import { useService } from '@web/core/utils/hooks';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

class PortalLoyalty extends Component {
    static selector = ".o_loyalty_container";

    setup() {
        this.dialogService = useService("dialog");
        attachEvent(".o_loyalty_card", "click", () => this....)
        useDelegatedEvents({
            "click .o_loyalty_card": "onClickLoyaltyCard",
        });
    }

    async onClickLoyaltyCard(ev) {
        const cardId = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${cardId}/values`);
        this.dialogService.add(PortalLoyaltyCardDialog, data);
    }
}

registry.category("website_element").add("loyalty.card", { selector: "...", Component: PortalLoyalty});
```

Version 2:
```js
import { registry } from '@web/core/registry';
import { Component } from '@odoo/owl';
import { useService } from '@web/core/utils/hooks';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

class PortalLoyalty extends Component {
    static selector = ".o_loyalty_container";
    static template = xml`
        <xpath expr="//div[hasclass('o_loyalty_card')]" position="attributes">
            <attribute name="t-on-click">onClickLoyaltyCard</attribute>
        </xpath>`;

    setup() {
        this.dialogService = useService("dialog");
    }

    async onClickLoyaltyCard(ev) {
        const cardId = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${cardId}/values`);
        this.dialogService.add(PortalLoyaltyCardDialog, data);
    }
}

registry.category("website_element").add("loyalty.card", PortalLoyalty);
```


Version 3, the pragmatic one:
```js
import { registry } from '@web/core/registry';
import { Component } from '@odoo/owl';
import { useService } from '@web/core/utils/hooks';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

class PortalLoyalty extends Component {
    static selector = ".o_loyalty_container";
    // static events = {
    //     'click .o_loyalty_card': '_onClickLoyaltyCard',
    // }

    setup() {
        this.dialogService = useService("dialog");
        useAddEventListener(".o_loyalty_car", () => {
            this.onClickLoyaltyCard()
        })
    }

    async onClickLoyaltyCard(ev) {
        const cardId = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${cardId}/values`);
        this.dialogService.add(PortalLoyaltyCardDialog, data);
    }
}

registry.category("website_element").add("loyalty.card", PortalLoyalty);
```






## Old notes
```js
class Test extends Component {
    setup() {
        // something here
    }
}

const root = app.createRoot(Test);
await root.mount(p, { position: "attach" });
```

```js
  registry.category("public_components").add("crm.mycomponent", {
    selector: "#someselector",
    Component: MyComponent,
    position: "attach", // or "replace_content", "replace_element", "first-child"
  });
```


```js
class Test extends Component {
    static template = xml`
        <xpath expr="//button[hasclass('my_button')]" position="attributes">
            <attribute name="t-on-click">toggle</attribute>
        </t>
        <xpath expr="//footer" position="replace">
            <footer>
                <p t-esc="footerText"/>
            </footer>
        </t>`; // template produces no DOM but can manipulate target node

    setup() {
        // can be stored as data attribute on graft node, implementation is left as an exercise for the reader
        this.state = useSerializedState({ active: false });
    }
    get footerText() {
        return this.state.active ? "Active" : "Inactive";
    }
    toggle() {
        this.state.value = !this.state.value;
    }
}
```

```js
import publicWidget from '@web/legacy/js/public/public_widget';
import { rpc } from '@web/core/network/rpc';
import { PortalLoyaltyCardDialog } from './loyalty_card_dialog/loyalty_card_dialog'

publicWidget.registry.PortalLoyaltyWidget = publicWidget.Widget.extend({
    selector: '.o_loyalty_container',
    events: {
        'click .o_loyalty_card': '_onClickLoyaltyCard',
    },

    async _onClickLoyaltyCard(ev) {
        const card_id = ev.currentTarget.dataset.card_id;
        let data = await rpc(`/my/loyalty_card/${card_id}/values`);
        this.call("dialog", "add", PortalLoyaltyCardDialog, data);
    },
});


class WebsiteElement {

}

class PortalLoyalty extends WebsiteElement {
    selector = ".o_loyalty_card";

    setup() {
        this.el.addEventListener("click", () => {
            const cardId = ev.currentTarget.dataset.card_id;
            const data = await rpc(`/my/loyalty_card/${cardId}/values`);
            this.env.services.dialog.add(PortalLoyaltyCardDialog, data);
        });
    }

}

registry.category("website_element").add("portal_loyalty", {
    selector: ".o_loyalty_card",
    event: "click",
    handler(el, env) {
        const cardId = ev.currentTarget.dataset.card_id;
        const data = await rpc(`/my/loyalty_card/${cardId}/values`);
        env.services.dialog.add(PortalLoyaltyCardDialog, data);
    }
})
```