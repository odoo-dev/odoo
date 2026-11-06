# Organize files by feature, not by type

Code is organized by feature, not by type. Instead of folders like `components/`,
`plugins/`, `services/` or `hooks/`, each feature gets one folder holding all of its
files: `notification/` contains the notification component, its plugin, its template
and its styles.

# Avoid getters

A getter hides the fact that a computation happens, and only saves a pair of
parentheses. Write a plain function instead: the call site then shows that code runs,
and it can take an argument the day the computation needs one.

When the value is derived state, an Owl `computed` is the better answer: unlike a
getter, it recomputes only when what it reads changes.

# Avoid patching JavaScript code

Patching (the `patch` function) is strongly discouraged inside Odoo itself. It is fine
outside of Odoo. A patch makes the code hard to reason about, since reading a snippet
no longer tells you what will run, and harder to maintain, since the patch and the code
it targets drift apart. Usually there is a better solution: design a proper extension
point.

# Translate one whole sentence per case

A translated sentence, in `_t()` or in the text of an Owl template, takes no word that
changes with the case: no translated keyword in a placeholder (a status, a record type),
and no count before a noun written in its plural form only. Write one complete literal
per case (0, 1 and more for a count) and pick it in code. In a template, the text around
a `t-out` is exported as a term of its own: a `t-if` branch holds only a sentence with no
value in it, and a sentence that carries a count or a name is built with `_t()` and
output whole with `t-out`.

```js
// good
const title = isAway ? _t("%(name)s is away", { name }) : _t("%(name)s is online", { name });

// bad: the sentence cannot agree with the word injected in it
const title = _t("%(name)s is %(status)s", { name, status: isAway ? _t("away") : _t("online") });
// bad: shows "1 books borrowed"
const label = _t("%(count)s books borrowed", { count });
```

The why, the count example and the exceptions are the same as in Python: see
[Translate one whole sentence per case](../../odoo-guidelines/guidelines/python.md#translate-one-whole-sentence-per-case)
of odoo-guidelines.
