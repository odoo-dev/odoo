# Migrate `t-ref` off the Owl 2 → Owl 3 compatibility layer

## Where we are today (read this first)

Odoo already runs on **Owl 3** (`v3.0.0-alpha.31`, bundled in
`addons/web/static/lib/owl/owl.js`). Legacy Owl 2 code keeps working thanks to a
**temporary compatibility layer**:

- `addons/web/static/src/owl2/owl3_compatibility_layer.js`

That layer is a *bridge*, not the destination. The end goal is to migrate the
codebase to native Owl 3 and then **delete the compatibility layer**. This
document covers the `t-ref` / `useRef` part of that migration.

### What the bridge does for refs

To run Owl 2 ref code on Owl 3, the bridge does two things:

1. **Template rename:** `t-ref` is rewritten to **`t-custom-ref`**, which the
   layer compiles into a native Owl 3 `t-ref` bound to an auto-created signal
   (`createRefSignal`, stored in `node.__refs__`).
2. **Hook shim:** `useRef(name)` is reimplemented to return an object whose
   `.el` getter reads that signal under the hood (via `owl.untrack`).

So today the codebase mostly looks like Owl 2 (`t-custom-ref="name"` +
`this.x = useRef("name")` + `this.x.el`), but it is really signals underneath.

Current usage in `addons/` (approximate):

- `t-custom-ref` (bridged): ~419 files
- `useRef` (shimmed): ~321 files
- native `t-ref` (already migrated / owl lib): ~24 files

### Your task

Convert the bridged ref usage to **native Owl 3 signal refs**, so the ref part
of the compatibility layer can be removed:

- `t-custom-ref="name"`  → `t-ref="this.nameRef"`
- `this.x = useRef("name")` → `nameRef = signal(null)`
- `this.x.el` → `this.nameRef()`

## Reference code (in this repo)

Two read-only reference checkouts live at the repo root (committed as
"add owl2 and owl3 code as reference to remove later" — delete once the
migration lands):

- `owl2/` — odoo/owl `v2.8.2` (the last Owl 2 version Odoo shipped)
- `owl3/` — odoo/owl `v3.0.0-alpha.31` (the Owl 3 monorepo currently bundled)

Authoritative API docs:

- Owl 3 refs: `owl3/doc/v3/owl/reference/refs.md`
- Owl 3 reactivity / signals: `owl3/doc/v3/owl/reference/reactivity.md`
- Owl 2 refs (the old API): `owl2/src` and `owl2/doc`

## 1. Core API mapping

| Feature   | Bridge / Owl 2 (current)              | Owl 3 native (target)                    |
| :-------- | :------------------------------------ | :--------------------------------------- |
| Hook      | `this.x = useRef("name")` (shimmed)   | `nameRef = signal(null)`                 |
| Import    | `import { useRef } from "@odoo/owl"`  | `import { signal } from "@odoo/owl"`     |
| Template  | `<div t-custom-ref="name"/>`          | `<div t-ref="this.nameRef"/>` (expression) |
| Access    | `this.x.el`                           | `this.nameRef()` (call the signal)       |
| Type      | `Ref`                                 | `Signal<HTMLElement \| null>`            |

`signal`, `Signal` and `Resource` are all exported from `@odoo/owl` in Owl 3.
There is **no** `useRef` in native Owl 3 (it only exists in the shim).

## 2. Multiple references in loops — use `Resource`

> ⚠️ This reverses the guidance from the original (months-old) version of this
> plan. The native Owl 3 API **does** provide `Resource` for this exact case;
> use it.

A single signal can only hold one element. When `t-ref` is inside a
`t-foreach`, bind it to a `Resource` instead — it adds elements as they mount
and removes them on unmount, and `.items()` is reactive:

> **Why not `signal.Array`?** `t-ref` inspects what you bind to it
> (`createRef` in `owl3/packages/owl-runtime/src/rendering/template_helpers.ts`):
> an object with `add()` + `delete()` (a `Resource`) collects every mounted
> element, while anything with only `set()` (a plain signal — including
> `signal.Array([])`) just gets `set(el)` called on it, overwriting it with the
> *last* element. So `signal.Array` is the right tool for reactive **data**
> arrays, but **not** for gathering DOM nodes via `t-ref` — use `Resource`.
> (A bare callback like `t-ref="(el) => ..."` is rejected outright.)

```xml
<t t-foreach="this.items()" t-as="item" t-key="item">
  <p t-ref="this.paragraphs" t-att-id="item"/>
</t>
```

```js
import { Component, signal, Resource } from "@odoo/owl";

class MyComponent extends Component {
  items = signal([1, 2, 3]);
  paragraphs = new Resource({ name: "paragraphs" });

  get allParagraphs() {
    return this.paragraphs.items(); // reactive list of <p> elements
  }
}
```

## 3. Pattern catalog — how to migrate each case found in odoo

These are the concrete `t-ref` / `useRef` shapes actually present in `addons/`,
each with a recipe. Counts are approximate (from a grep of `addons/`) to convey
relative weight.

### Pattern A — Basic single ref (the bulk of the work)

`useRef("x")` + `t-custom-ref="x"` + `this.xRef.el`. Hundreds of these
(`useRef("root")` alone ≈ 123, `this.inputRef.el` ≈ 122).

```js
// before                                   // after
this.inputRef = useRef("input");            inputRef = signal(null);
//   t-custom-ref="input"                    //   t-ref="this.inputRef"
this.inputRef.el?.focus();                   this.inputRef()?.focus();
```

### Pattern B — Ref read inside an effect / listener (`() => [ref.el]`)

≈ 59 sites, plus the `useRefListener` / `useSpellCheck` helpers in
`core/utils/hooks.js`. Owl 2 `useEffect(fn, deps)` took an explicit dependency
function; **Owl 3 `useEffect(fn)` takes no deps and auto-subscribes to any
signal read inside `fn`** (verified in `owl3/.../owl-runtime/src/hooks.ts`:
`useEffect(fn) → onWillDestroy(effect(fn))`). So drop the dependency array and
read the signal inside the effect:

```js
// before (owl2 / bridge: runs as useLayoutEffect with deps)
useEffect(
  (el) => {
    el?.addEventListener("click", cb);
    return () => el?.removeEventListener("click", cb);
  },
  () => [this.rootRef.el]
);

// after (owl3 native: reading the signal subscribes to it)
useEffect(() => {
  const el = this.rootRef();
  el?.addEventListener("click", cb);
  return () => el?.removeEventListener("click", cb);
});
```

This can be done incrementally: `() => [this.rootRef()]` still works under the
bridge, but the native form (no deps, read inside) is the target.

### Pattern C — Multiple refs in a loop → `Resource`

See section 2. `t-custom-ref` inside a `t-foreach` becomes
`t-ref="this.theRefs"` backed by `new Resource()`; read via `.items()`.

### Pattern D — Ref forwarded between parent and child

≈ 69 files use `useChildRef` / `useForwardRefToParent`
(`core/utils/hooks.js`). These exist because **Owl 2 allowed `t-ref` on a
component to grab a child's DOM node — Owl 3 forbids it** (the compiler errors:
"t-ref is no longer supported on components"). Owl 3's replacement: the parent
owns a `signal`, passes it to the child as a prop, and the child binds it with
`t-ref="this.props.xxxRef"` (confirmed by the owl3 test *"ref is set by child
component"*).

```js
// PARENT — owns the signal, passes it down
class Parent extends Component {
  // template: <Child inputRef="this.inputRef"/>
  inputRef = signal(null);
  focus() { this.inputRef()?.focus(); }
}

// CHILD — binds the forwarded signal directly, no helper hook
class Child extends Component {
  // template: <input t-ref="this.props.inputRef"/>
  static props = { inputRef: { type: Function } }; // a signal is a function
}
```

`useChildRef` / `useForwardRefToParent` (and the `ForwardRef` typedef) become
obsolete and should be deleted once their users are migrated. Because this
crosses the parent/child boundary, **migrate both ends in the same change.**

### Pattern E — Dynamic / variable ref name (`useRef(refName)`)

≈ 21 sites pass a variable name, the clearest being `usePosition(refName, …)`
in `core/position/position_hook.js`, which does `const ref = useRef(refName)`
internally. You cannot turn a runtime string into a static `t-ref` expression,
so the fix is at the hook boundary: **change the hook to accept a `signal`
instead of a name string**, use `ref()` instead of `ref.el` inside, and have
callers pass their signal + bind `t-ref="this.xRef"`.

```js
// before: usePosition("popper", getTarget, options)  + t-custom-ref="popper"
// after:  usePosition(this.popperRef, getTarget, options) + t-ref="this.popperRef"
//   inside the hook: ref.el  →  ref()
```

These shared hooks have many callers — record each (filepath + signature) in
`t-ref-function_to_adapt.md` (see section 7) and migrate the hook + its callers
together.

### Pattern F — Ref passed into a hook as an option (`ref: this.rootRef`)

A handful of hooks receive a ref object via options (e.g. `useSortable`,
`useDraggable`: `{ ref: this.rootRef }`). Pass the **signal** instead and update
the hook to read `ref()` rather than `ref.el`.

### Pattern G — Conditional ref (behind `t-if`)

A signal is `null` whenever its element is not mounted. Replace truthiness
checks on `.el` with the signal call:

```js
if (this.menuRef.el) { … }     →     if (this.menuRef()) { … }
this.menuRef.el?.focus();      →     this.menuRef()?.focus();
```

For a ref shared by a `t-if`/`t-else` pair, bind the **same** signal on both
branches (owl3 handles the swap correctly — see the *"ref shared between t-if
and t-else"* tests); or derive it with `computed(() => this.ref1() || this.ref2())`.

## 4. Exhaustive "to-do" list

- [ ] **Imports:** replace `useRef` from `@odoo/owl` with `signal` (and
      `Resource` where loops are involved).
- [ ] **Declarations:** replace `this.x = useRef("name")` (in `setup` or as a
      class field) with `nameRef = signal(null)`.
- [ ] **Templates:** change `t-custom-ref="name"` to `t-ref="this.nameRef"`.
      Keep the `this.` prefix — `t-ref` now takes an expression, not a string.
- [ ] **Access:** change every `this.x.el` to `this.nameRef()`.
- [ ] **Optionals:** a signal returns `null` when the element is not in the DOM
      (e.g. behind `t-if`). Use `this.nameRef()?.…` or guard with
      `if (this.nameRef())`.
- [ ] **Loops:** migrate multi-element refs to `Resource` (section 2 / pattern C).
- [ ] **Effects/listeners:** convert `() => [ref.el]` dependency effects to
      native auto-tracking `useEffect(fn)` (pattern B).
- [ ] **Forwarded refs:** replace `useChildRef`/`useForwardRefToParent` with a
      parent-owned signal passed as a prop (pattern D).
- [ ] **Ref-taking hooks:** migrate hooks that accept a ref name/object so they
      take a signal (patterns E & F); log them in `t-ref-function_to_adapt.md`.
- [ ] **TypeScript:** type refs as `Signal<HTMLElement | null>` instead of `Ref`.

## 5. "Do not" (safety rules)

- **DO NOT** leave `useRef` behind — it only survives via the shim we are
  removing.
- **DO NOT** use `t-ref` (or `t-custom-ref`) on Components, e.g.
  `<MyComponent t-ref="..."/>`. Owl 3 `t-ref` is for DOM elements only. To reach
  a child component, use callback props or shared reactive state.
- **DO NOT** pass a string to `t-ref`. `<div t-ref="myRef"/>` resolves `myRef`
  as a template variable, not a string identifier — write `t-ref="this.myRef"`.
- **DO NOT** forget signals are functions: `this.myRef` is the signal,
  `this.myRef()` is the element.
- **No getters:** do not wrap signal access in `get el() { ... }`. Read the
  signal directly.
- **No type checking:** do not use `typeof x === ...` to detect signals.
- **No manual DOM touching:** rely on the signal's value, not on manually
  assigning the DOM element outside the `t-ref` directive.

## 6. Transition example

Before (current bridge state):

```js
import { Component, useRef, xml } from "@odoo/owl";

class MyComp extends Component {
  static template = xml`<div t-custom-ref="root">Hello</div>`;
  setup() {
    this.rootRef = useRef("root");
  }
  focus() {
    if (this.rootRef.el) {
      this.rootRef.el.focus();
    }
  }
}
```

After (native Owl 3):

```js
import { Component, signal, xml } from "@odoo/owl";

class MyComp extends Component {
  static template = xml`<div t-ref="this.rootRef">Hello</div>`;
  rootRef = signal(null);
  focus() {
    this.rootRef()?.focus();
  }
}
```

## 7. Functions that take a ref/string argument

Functions that receive an old `useRef` result, a `ForwardRef`, or a ref-name
string (patterns D, E, F) must be adapted to take a signal instead. When the
function is local to the module you're migrating, fix it in place. When it is a
**shared helper with callers across modules** (e.g. `usePosition`,
`useSortable`, `useChildRef`), do not scatter half-migrations: record each one
— filepath + signature — in `t-ref-function_to_adapt.md` at the repo root, and
migrate the helper together with its callers in a dedicated pass.

## 8. Workflow & scope

- **Pick one module at a time** and migrate it fully (templates + JS + types).
- **Scope flexibility:** the chosen module is the priority, but you may touch an
  external module *only* when a change in your module requires a corresponding
  update there (a shared ref helper, a cross-module reference, a breakage).
  Always preserve the integrity of cross-module references.
- **Commit** when a module's migration is complete and tests pass.
