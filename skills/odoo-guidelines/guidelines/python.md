# Imports

PEP 8 applies; the `ruff.toml` at the repository root is the reference for what
is enforced.

- Four groups, each alphabetically sorted (the ruff isort order):
  1. stdlib
  2. third-party libs
  3. `odoo` submodules (`from odoo import Command, api, fields, models`)
  4. `odoo.addons.*` (rarely, only if necessary)

# Naming and model layout

- Model `_name`: dotted, prefixed by module, **singular** (`sale.order`, not
  `sale.orders`). Transient/wizard: `<base_model>.<action>` (avoiding the word
  "wizard" is a soft preference; core ships many `.wizard` names). SQL-view report model: `<base_model>.report.<action>`.
- A variable holding a model class is PascalCase (`Partner =
  self.env['res.partner']`). Suffix a var holding a record id / list of ids
  with `_id` / `_ids` (don't name a `res.partner` record `partner_id`).
- Method-name patterns: compute `_compute_<field>`, search `_search_<field>`,
  default `_default_<field>`, selection `_selection_<field>`, onchange
  `_onchange_<field>`, constraint `_check_<name>`, object action `action_*`
  (acts on one record, so start it with `self.ensure_one()`).
- Model body order: private attrs (`_name`, `_description`, `_inherit`) → default
  methods → field declarations → `models.Constraint`/`models.Index` attributes
  (core also places these right after the private attrs) → compute/inverse/search
  (field order) → selection methods → `@api.constrains`/`@api.onchange` → CRUD
  overrides → action methods → other business methods.

# Translate only static literals

Translate only **static literals**, passing interpolation values as
arguments; in model code the current API is `self.env._(...)`.

```python
# good
raise UserError(self.env._("Record %s cannot be modified", record.display_name))

# good (several variables): name them so translators keep them straight
msg = self.env._("%(count)s records imported by %(user)s", count=len(records), user=user.name)

# good: a list argument is formatted per language ("a, b and c")
raise UserError(self.env._("Missing fields: %s", missing_names))

# bad (formats before the lookup): the dynamic string matches no exported term
raise UserError(self.env._("Record %s cannot be modified" % record.display_name))

# bad (formats after the lookup): bypasses placeholder validation and reordering
raise UserError(self.env._("Record %s cannot be modified") % record.display_name)

# bad: manual join ignores the user's language and its list rules
raise UserError(self.env._("Missing fields: %s", ", ".join(missing_names)))
```

## Why

- Translations are keyed on the exact source literal, at export (building the
  `.pot`) and at runtime lookup. Concatenation, f-strings, or `%`-formatting
  inside `_()` produce strings that exist in neither.
- Named placeholders let translators reorder words per language; passing them
  as `_()` arguments lets the framework validate them per translation and
  apply Markup-aware escaping (post-lookup `%` formatting loses that safety).

## Exceptions and notes

- Bare `_` (imported from `odoo`) is the backward-compatible API: it locates
  the environment by inspecting the caller's frame; in plain functions and
  comprehensions it silently returns the untranslated (or wrong-language)
  string with only a logged warning; prefer `self.env._`.
- Never call `_()` at module or class level: it runs at import time with no
  user language and silently doesn't translate. Translate inside the method
  when you can; if a module-level constant is unavoidable, make it lazy
  (`_lt = LazyTranslate(__name__)`; `LABEL = _lt("...")`) and resolve it where
  the language is known, by passing it through `self.env._(LABEL)`.
- Field *values* are translated via the field's `translate` flag, never `_()`.
- Prefer `%`-style placeholders over `.format()`.

# Translate one whole sentence per case

A translated sentence takes no word that changes with the case: no translated
keyword in a placeholder (a state, a document type, "exactly" or "at most"),
and no count before a noun written in its plural form only. Write one complete
literal per case and pick it in code.

```python
# good
if book.kind == "magazine":
    msg = self.env._("Your magazine %(name)s is ready.", name=book.name)
else:
    msg = self.env._("Your book %(name)s is ready.", name=book.name)

# good
if not count:
    msg = self.env._("No book borrowed")
elif count == 1:
    msg = self.env._("1 book borrowed")
else:
    msg = self.env._("%(count)s books borrowed", count=count)

# bad: the sentence cannot agree with the word injected in it
kind = self.env._("magazine") if book.kind == "magazine" else self.env._("book")
msg = self.env._("Your %(kind)s %(name)s is ready.", kind=kind, name=book.name)

# bad: shows "1 books borrowed"
msg = self.env._("%(count)s books borrowed", count=count)
```

## Why

- Articles, adjectives and verbs agree with the noun they go with: in French
  "livre" is masculine and "revue" feminine ("Votre livre est prêt", "Votre
  revue est prête"). The translator of a shared sentence does not know which
  word will fill it, and can write only one ending.
- `_()` has no plural API: the count picks the literal in code. One string
  each for 0, 1 and more covers English ("0 books") and French ("0 livre"),
  which do not put 0 on the same side; the languages with more forms (Polish,
  Arabic) get the plural form, the best the API offers today.

## Exceptions

- A value that is data, not grammar, stays a placeholder: a name, a reference,
  an amount already formatted, a list through `format_list`.
- A count that cannot be 0 or 1 in its branch needs no other string ("and 3
  others" shown from 2 hidden items on). Showing the item itself is often
  better than "and 1 other".
- The rule holds for the text of QWeb templates too, where the text around a
  `t-out` or a `t-field` is exported as a term of its own: a `t-if` branch
  holds only a sentence with no value in it ("No book borrowed"). A sentence
  that carries a count or a name is built with `_()` and output whole with
  `t-out`.
