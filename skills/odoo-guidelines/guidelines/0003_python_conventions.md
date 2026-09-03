# Python imports, naming, and model layout

PEP 8 applies; the `ruff.toml` at the repository root is the reference for what
is enforced.

## Imports

- Four groups, each alphabetically sorted (the ruff isort order):
  1. stdlib
  2. third-party libs
  3. `odoo` submodules (`from odoo import Command, api, fields, models`)
  4. `odoo.addons.*` (rarely, only if necessary)

## Naming & method conventions

- Model `_name`: dotted, prefixed by module, **singular** (`sale.order`, not
  `sale.orders`). Transient/wizard: `<base_model>.<action>` (avoiding the word
  "wizard" is a soft preference — core ships many `.wizard` names). SQL-view report model: `<base_model>.report.<action>`.
- A variable holding a model class is PascalCase (`Partner =
  self.env['res.partner']`). Suffix a var holding a record id / list of ids
  with `_id` / `_ids` (don't name a `res.partner` record `partner_id`).
- Method-name patterns: compute `_compute_<field>`, search `_search_<field>`,
  default `_default_<field>`, selection `_selection_<field>`, onchange
  `_onchange_<field>`, constraint `_check_<name>`, object action `action_*`
  (acts on one record — start it with `self.ensure_one()`).
- Model body order: private attrs (`_name`, `_description`, `_inherit`) → default
  methods → field declarations → `models.Constraint`/`models.Index` attributes
  (core also places these right after the private attrs) → compute/inverse/search
  (field order) → selection methods → `@api.constrains`/`@api.onchange` → CRUD
  overrides → action methods → other business methods.
