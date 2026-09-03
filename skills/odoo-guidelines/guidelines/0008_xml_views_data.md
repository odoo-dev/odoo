# XML — views, actions, data

- Record format: put `id` before `model`; inside a `field`, `name` first, then
  the value (tag body or `eval`), then other attributes by importance. Group
  records by model.
- Prefer the syntactic-sugar tags `<menuitem>`, `<template>`, and `<asset>`
  over raw `<record>`. Trap: an `active` attribute on `<template>`/`<asset>`
  is applied at record creation and module *install/re-install* (`-i`) only —
  a module **update** (`-u`) updates the arch but never changes `active`, so
  it can't deactivate an already-installed record.
- `<data noupdate="1">` only for non-updatable data; if the whole file is
  noupdate, set `noupdate="1"` on `<odoo>` and drop `<data>`.
- XML id patterns: view `<model>_view_<type>` (`form`/`list`/`kanban`/`search`),
  action `<model>_action[_<detail>]`, window-action view
  `<model>_action_view_<type>`, menu `<model>_menu[_<do_stuff>]`, group
  `<module>_group_<name>`, rule `<model>_rule_<group>`. The record `name` mirrors
  the id with dots instead of underscores; actions get a real display name.
- CSS classes in views and templates: prefix with `o_<module>` (`o_` alone is
  reserved for the web client), never style through ids, and keep names flat
  (`o_element_entry`) rather than mirroring the DOM nesting.
- Inheriting a view: see [0014](0014_view_inheritance.md).
