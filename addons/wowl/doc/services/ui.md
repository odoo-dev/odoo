# UI service

| Technical name | Dependencies |
| -------------- | ------------ |
| `ui`           |              |

## Overview

The `ui` service offers miscellaneous UI features:

- ownership management.
  The default UI owner is the `document` element, but the `ui` service
  lets anyone claim the UI ownership. It is useful e.g. for dialogs.
- block or unblock the UI.
  When the ui will be blocked, a loading screen blocking any action will cover the UI.

## API

The `ui` service provides the following API:

- `bus: EventBus`: a bus

- `block(): void`: this method will activate the loading screen to block the ui.

- `unblock(): void`: This method will disable the loading screen in order to unblock the ui.
  if it was not already disable.

- `ìsBlocked (boolean)`: informs on the UI blocked state

- `takeOwnership(owner: DOMElement): {release():void}`: applies an UI ownership and
  returns an object containing a function to release it

- `getOwner(): DOMElement`: gives the actual UI owner element

In addition to that, you have access to some development helpers which are **greatly** recommended:

- `useUIOwnership(refName?:string)`: a hook that ensures the UI ownership will
  take place/get released each time your component gets mounted/unmounted.
  By default, the element that will take the UI ownership is the component root's.
  It can be delegated to another element through the usage of a `t-ref` directive,
  providing its value to this hook.

### Good to know

If the `block()` method is called several times simultaneously, the same number of times the `unblock()` function must be used to unblock the UI.

## Example: ownership management

Here is how one component could take the ownership of the UI

### With `useUIOwnership` hook

```js
class MyComponent extends Component {
  setup() {
    useUIOwnership();
  }
}
```

### With `useUIOwnership` hook: ref delegation

```js
class MyComponent extends Component {
  setup() {
    useUIOwnership("delegatedRef");
  }
}
MyComponent.template = owl.tags.xml`
  <div>
    <h1>My Component</h1>
    <div t-ref="delegatedRef"/>
  </div>
`;
```

### Manually

```js
class MyComponent extends Component {
  setup() {
    this.uiService = useService("ui");
  }
  mounted() {
    const ownerElement = this.el;
    this.uiOwnership = this.uiService.takeOwnership(ownerElement);
  }
  willUnmount() {
    this.uiOwnership.release();
  }
}
```

## Example: block/unblock

Here is how one component can block and unblock the UI:

```js
class MyComponent extends Component {
    ...
    ui = useService('ui');

    ...

    someHandlerBlock() {
        // The loading screen will be displayed and block the UI.
        this.ui.block();
    }

    someHandlerUnblock() {
        // The loading screen is no longer displayed and the UI is unblocked.
        this.ui.unblock();
    }
}
```
