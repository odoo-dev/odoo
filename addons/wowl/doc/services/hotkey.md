# Hotkey Service

| Technical name | Dependencies |
| -------------- | ------------ |
| `hotkey`       | `ui`         |

## Overview

The `hotkey` service offers an easy way to react to a
fine bounded subset of keyboard inputs: [hotkeys](#hotkey-definition).

It provides some very special features:

- awareness of the UI active element: no need to worry about that from your side.

- a clean subset of listenable hotkeys:
  it ensures a consistent experience through different OSes or browsers.

- a single way to bypass any editable HTML element having the focus.

- a `[aria-keyshortcuts]` attribute: it gives a JS-free way to make
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
  - the four arrows: **ArrowUp**, **ArrowLeft**, **ArrowDown** and **ArrowRight**
  - **PageUp**, **PageDown**, **Home** and **End**
  - **Backspace**, **Enter** and **Escape**

Valid modifiers are:

- **Control**
- **Shift**

Each hotkey can have none or any modifier in the valid subset.

The composition character is the plus sign: "**+**".

Hotkeys are not case sensitive.

Hotkeys **must be** written:

- respecting the [`aria-keyshortcuts` W3 specs](https://www.w3.org/TR/wai-aria-1.1/#aria-keyshortcuts).
- respecting the order of their parts:
  - modifiers must come first
  - modifiers must get alphabetically sorted
  - single key part must come last

E.g. following hotkeys are valid:

- `Control+Shift+5`
- `g`
- `Control+g` (same as `Control+G`)

E.g. following hotkeys are **NOT** valid:

- `Alt+o`: **alt** is neither a valid modifier nor a valid single key
- `o+d`: combining two or more single keys is not valid
- `Shift-p`: the composition character must be "+" and not "-"
- `Tab`: it is not part of the list of valid single keys, nor modifiers

### Hotkey Activation

Hotkeys are activated through keyboard inputs.

By default, to activate an hotkey when the focus is on an editable element
(e.g. an `<input/>` or a `<textarea/>`), `ALT` key should get pressed simultaneously.
It is also possible to register an hotkey that will be
fireable in editable elements, even without pressing ALT key.

When the service detects an hotkey activation, it will:

- execute **all matching registrations callbacks**.
- click on **all visible elements having a matching `[aria-keyshortcuts]` attribute**.

The `hotkey` service will also **make sure that those
registrations and elements belong to the correct UI owner** (see [`ui` service](ui.md)).

## API

The `hotkey` service provides the following API:

- `registerHotkey(hotkey: string, callback: ()=>void, options: { allowInEditable?: boolean, allowRepeat?: boolean }): number`:
  it asks the service to call the given callback when a matching hotkey is pressed.
  `options.allowInEditable`: default is false.
  `options.allowRepeat`: default is false.
  This method returns a token you can use to unsubscribe later on.

- `unregisterHotkey(token: number): void`:
  it asks the service to forget about the token matching registration.

In addition to that, you have access to some development helpers which are **greatly** recommended:

- `useHotkey(hotkey: string, callback: ()=>void, options: { allowInEditable?: boolean, allowRepeat?: boolean }): void`:
  a hook that ensures your registration exists only when your component is mounted.

- `[aria-keyshortcuts]`: an HTML attribute taking an hotkey definition.
  When the defined hotkey is pressed, the element gets clicked.

## Examples

### `useHotkey` hook

```js
class MyComponent extends Component {
  setup() {
    useHotkey("a", this.onAHotkey.bind(this));
    useHotkey("Home", () => this.onHomeHotkey());
  }
  onAHotkey() { ... }
  onHomeHotkey() { ... }
}
```

### `[aria-keyshortcuts]` attribute

```js
class MyComponent extends Component {
  setup() {
    this.variableHotkey = "control+j";
  }
  onButton1Clicked() {
    console.log("clicked either with the mouse or with hotkey 'Shift+o'");
  }
  onButton2Clicked() {
    console.log(`clicked either with the mouse or with hotkey '${this.variableHotkey}'`);
  }
}
MyComponent.template = xml`
  <div>

    <button t-on-click="onButton1Clicked" aria-keyshortcuts="Shift+o">
      One!
    </button>

    <button t-on-click="onButton2Clicked" t-att-aria-keyshortcuts="variableHotkey">
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
    this.hotkeyToken1 = this.hotkey.registerHotkey("backspace",
      () => console.log('backspace has been pressed'));
    this.hotkeyToken2 = this.hotkey.registerHotkey("Shift+P",
      () => console.log('Someone pressed on "shift+p"!'));
  }
  willUnmount() {
    // You need to manually unregister your registrations when needed!
    this.hotkey.unregisterHotkey(this.hotkeyToken1);
    this.hotkey.unregisterHotkey(this.hotkeyToken2);
  }
}
```
