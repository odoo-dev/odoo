# Rust Asset Bundler

Routes Odoo's JavaScript asset bundling through the [`odoo_bundler`](https://github.com/Goaman/odoo_bundler)
Rust extension instead of the pure-Python `AssetsBundle`. Enabled behind a flag,
so the Python bundler stays the default.

## How it works

`AssetsBundle` is a plain Python class (not an ORM model), so it can't be
extended with `_inherit`. This module **monkey-patches** `AssetsBundle.js()` at
import time (`models/assetsbundle.py`) — no core file is edited. Because the
patch only loads when this module is installed, **installing the module is the
switch**: `js()` then collects the bundle's ordered on-disk file paths
(`self.javascripts + self.templates`) and calls `odoo_bundler.bundle(name, files,
minify_level=...)`, saving the result as the bundle attachment. It transparently
falls back to the original Python `js()` when:

- the `odoo_bundler` extension isn't importable, or
- an asset has no on-disk file (inline / `ir.attachment`-backed).

## Setup

Build & install the Rust extension into the same Python env that runs Odoo:

```bash
cd /path/to/odoo_bundler
maturin develop --release
```

Then install the module — that is all that's needed to activate it:

```bash
./odoo-bin -d <db> --addons-path=addons,../enterprise -i rust_bundler
```

Uninstall the module (or make `odoo_bundler` unimportable) to revert to the
pure-Python bundler.

## Benchmark

`benchmark.py` compares Rust vs Python bundling on the same file list with cold
caches, and writes `<bundle>.from_python.js` / `<bundle>.from_rust.js` for diffing:

```bash
./odoo-bin shell -d <db> --addons-path=addons,../enterprise \
    --no-http --log-level=error < addons/rust_bundler/benchmark.py
```

Measured on this machine (`website` installed, median of 5, cold caches):

| bundle              | files          | Python  | Rust   | speedup |
|---------------------|----------------|---------|--------|---------|
| `web.assets_web`      | 1458 JS + 633 XML | 1958 ms | 77 ms  | **25.5×** |
| `web.assets_frontend` | 496 JS + 110 XML  | 604 ms  | 21 ms  | **28.6×** |

## Output parity (Rust vs Python)

The two bundlers produce the **same set** of modules and templates — identical
`odoo.define(...)` counts (1423 / 463) and `registerTemplate(...)` counts
(950 / 184), and identical `/* /module/static/... */` header URLs. The import
crawl resolved exactly odoo's manifest-defined set here (no extra/missing files).

They are **not byte-for-byte identical**, for these reasons:

1. **Minifier engine.** Python uses `rjsmin` (aggressive: strips comments,
   `'use strict'`). Rust's `oxc` at `whitespace` level keeps comments and
   `/* @__PURE__ */` annotations and emits `"use strict"`, so Rust output is
   ~17–25% larger. `minify_level="full"` would shrink it but also mangle names,
   diverging further semantically.
2. **Non-deterministic dependency order.** The Rust transpiler emits the
   `odoo.define(name, [deps], ...)` dependency array in a non-stable order
   (parallel/hash-set collection), so two runs on identical input differ in
   byte order (same length). Odoo's bundle version/URL is derived from asset
   descriptors (url + mtime), not content, so caching/URLs stay stable — but the
   served bytes can vary between regenerations. Worth fixing upstream in
   `odoo_bundler` if reproducible builds are required.
