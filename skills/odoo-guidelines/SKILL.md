---
name: odoo-guidelines
description: >-
  House rules for Odoo addon code: module structure, manifest, Python/ORM,
  fields, controllers, XML views and data, QWeb reports, access rights and
  record rules, performance, tests. Use when writing or reviewing any file in
  an Odoo addon outside static/ (for the JavaScript, Owl templates and SCSS
  under static/, see odoo-web-guidelines).
---

# Odoo addon guidelines

House rules for code in Odoo addons (`addons/*` and `odoo/addons/*`).
Everything an addon ships under `static/` has its own skill:
`odoo-web-guidelines`.

Each domain lives in its own numbered file in `guidelines/`. The number is
an identifier, not a priority: no guideline outranks another. Read the ones
that match the files you are touching.

| Guideline | Read it when |
| --- | --- |
| [0001 Module structure & file naming](guidelines/0001_module_structure.md) | creating or moving files in an addon, or adding a module |
| [0002 Manifest](guidelines/0002_manifest.md) | touching `__manifest__.py` |
| [0003 Python imports, naming, layout](guidelines/0003_python_conventions.md) | writing Python anywhere in an addon |
| [0004 ORM idioms & correctness](guidelines/0004_orm.md) | reading/writing records, computes, onchange, constraints, cursors |
| [0005 Translations](guidelines/0005_translations.md) | user-facing strings in Python |
| [0006 Fields](guidelines/0006_fields.md) | declaring or modifying field definitions |
| [0007 Controllers](guidelines/0007_controllers.md) | touching `controllers/` or `@route` |
| [0008 XML views, actions, data](guidelines/0008_xml_views_data.md) | touching `views/`, `data/`, or any XML records |
| [0009 QWeb PDF reports](guidelines/0009_qweb_reports.md) | report templates or `_get_report_values` |
| [0010 Access rights (`ir.access`)](guidelines/0010_security_data.md) | touching `security/` (`ir.access.csv`, groups) |
| [0012 Performance](guidelines/0012_performance.md) | code that loops over records or queries in a loop |
| [0013 Tests](guidelines/0013_tests.md) | touching `tests/` |
| [0014 Inheriting views](guidelines/0014_view_inheritance.md) | extending or overriding an existing view |
| [0015 Batch ORM calls](guidelines/0015_batch_orm_calls.md) | ORM calls (`create`/`search*`/aggregates) inside a loop |
| [0016 Changes in a stable version](guidelines/0016_stable_changes.md) | any change targeting a released branch rather than master |

To add or restructure a guideline, follow [AUTHORING.md](AUTHORING.md).
