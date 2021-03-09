# Hotkey Service

| Technical name | Dependencies                           |
| -------------- | -------------------------------------- |
| `hotkey`       | `ui`                                   |

## Overview

The `hotkey` service offers an easy way to react to a
fine bounded subset of keyboard inputs: [hotkeys](#hotkey-definition).

It provides some very special features:

- awareness of the UI ownership: no need to worry about that from your side.

- a clean subset of listenable hotkeys:
  it ensures a consistent experience through different OSes or browsers.

- a single way to bypass any editable HTML element having the focus.

- a `[data-hotkey]` attribute: it gives a JS-free way to make
  any HTML element "clickable" through an hotkey press.

- a `useHotkey` hook: it ensures your JS code executes only
  when your component is alive and present in the DOM.

- a **contextual hint dialog**: it shows the user all the activables
  hotkeys he can trigger within the actual UI context.

### Hotkey Definition

An **hotkey** represents as a string a single keyboard
input from a _single key_ combined or not with _modifiers_.

Valid single keys are:

- **a-z** letters
- **0-9** numbers: _no distinction is made between above-letters-row and numpad location_
- navigation keys:
  - the four arrows: **arrowup**, **arrowleft**, **arrowdown** and **arrowright**
  - **pageup**, **pagedown**, **home** and **end**
  - **backspace**, **enter** and **escape**

Valid modifiers are:

- **control**
- **shift**

Each hotkey can have none or any modifier in the valid subset.

The composition character is dash: "**-**".

Modifiers can be considered as single keys.
Single keys can **not** be considered as modifiers.

Hotkeys **must be** written:

- in lowercase
- respecting the order of their parts:
  - modifiers must come first
  - modifiers must get alphabetically sorted
  - single key part must come last

E.g. following hotkeys are valid:

- `g`
- `control-g`
- `control-shift-5`
- `control`
- `control-shift`

E.g. following hotkeys are **NOT** valid:

- `alt-o`: **alt** is neither a valid modifier nor a valid single key
- `o-d`: combining two or more single keys is not valid
- `Control-G`: lowercase is mandatory
- `shift+p`: the composition character must be "-" and not "+"
- `tab`: it is not part of the list of valid single keys, nor modifiers

### Hotkey Activation

Hotkeys are activated through keyboard inputs.

To activate an hotkey when the focus is on an editable element
(e.g. an `<input/>` or a `<textarea/>`), `ALT` key should get pressed simultaneously.

When the service detects an hotkey activation, it will:

- execute **all matching subscriptions callbacks**.
- click on **all visible elements having a matching `[data-hotkey]` attribute**.

The `hotkey` service will also **make sure that those
subscriptions and elements belong to the correct UI owner** (see [`ui` service](ui.md)).

## API

The `hotkey` service provides the following API:

- `subscribe(sub: HotkeySubscription): number`:
  it ask the service to call the given callback when a matching hotkey is pressed.
  An `HotkeySubscription` object should take the form of:
  `{ hotkey: string, callback: (hotkey:string)=>void, hint?: string }`.
  If defined, the `HotkeySubscription.hint` key must provide the subscription description.
  This method returns a token you can use to unsubscribe later on.

- `unsubscribe(token: number): void`:
  it ask the service to forget about the token matching subscription.

In addition to that, you have access to some development helpers which are **greatly** recommended:

- `useHotkey(sub: HotkeySubscription): void`:
  a hook that ensures your subscription exist only when your component is mounted.
  It takes an `HotkeySubscription` object.

- `[data-hotkey]`: an HTML attribute taking an hotkey definition.
  When the defined hotkey is pressed, the element gets clicked.

## Examples

### `useHotkey` hook
```js
class MyComponent extends Component {
  setup() {
    useHotkey({ hotkey: "a", callback: this.onAHotkey.bind(this) });
    useHotkey({ hotkey: "home", callback: () => this.onHomeHotkey() });
  }
  onAHotkey(arg) { ... }
  onHomeHotkey(arg) { ... }
}
```

### `[data-hotkey]` attribute
```js
class MyComponent extends Component {
  setup() {
    this.variableHotkey = "control-j";
  }
  onButton1Clicked() {
    console.log("clicked either with the mouse or with hotkey 'shift-o'");
  }
  onButton2Clicked() {
    console.log(`clicked either with the mouse or with hotkey '${this.variableHotkey}'`);
  }
}
MyComponent.template = xml`
  <div>

    <button t-on-click="onButton1Clicked" data-hotkey="shift-o">
      One!
    </button>

    <button t-on-click="onButton2Clicked" t-att-data-hotkey="variableHotkey">
      Two!
    </button>

  </div>
`;
```

### manual usage of the service
```js
class MyComponent extends Component {
  setup() {
    this.hotkey = useService("hotkey");
  }
  mounted() {
    this.hotkeyToken1 = this.hotkey.subscribe({
      hotkey: "backspace",
      callback: () => console.log('backspace has been pressed')
    });
    this.hotkeyToken2 = this.hotkey.subscribe({
      hotkey: "shift",
      callback: () => console.log('Someone pressed on "shift"!')
    });
  }
  willUnmount() {
    // You need to manually unregister your subscriptions when needed!
    this.hotkey.unsubscribe(this.hotkeyToken1);
    this.hotkey.unsubscribe(this.hotkeyToken2);
  }
}
```
