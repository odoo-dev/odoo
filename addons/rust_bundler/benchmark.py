"""Benchmark: Rust (odoo_bundler) vs Python JS asset bundling.

Compares bundling wall time and output for the given asset bundles, on the exact
same ordered file list, with cold caches on every timed iteration. It also writes
``<bundle>.from_python.js`` / ``<bundle>.from_rust.js`` to ``--out`` for diffing.

Run it through the odoo shell (the ``env`` global is provided by the shell)::

    ./odoo-bin shell -d <db> --addons-path=addons,../enterprise \\
        --no-http --log-level=error < addons/rust_bundler/benchmark.py

    # benchmark a specific set of bundles (e.g. the ones compiled by the JS tests):
    BENCH_BUNDLES=web.assets_unit_tests,web.tests_assets ./odoo-bin shell -d <db> ...

The Rust path calls ``odoo_bundler.bundle()`` directly; the Python path replicates
``AssetsBundle.js()``'s minified branch (without DB writes) so both measure pure
bundling CPU work (read + transpile + minify + XML), not attachment I/O.
"""
import os
import textwrap
import time
import tempfile

# Bundles to benchmark. Override with a comma-separated BENCH_BUNDLES env var,
# e.g. to benchmark exactly the bundles compiled while launching the JS tests.
DEFAULT_BUNDLES = ["web.assets_web", "web.assets_frontend"]
BUNDLES = [b.strip() for b in os.environ.get("BENCH_BUNDLES", "").split(",") if b.strip()] or DEFAULT_BUNDLES
ITERATIONS = int(os.environ.get("BENCH_ITERATIONS", "5"))
OUT_DIR = tempfile.gettempdir()

try:
    import odoo_bundler
except ImportError:
    raise SystemExit("odoo_bundler is not installed; run `maturin develop --release` first.")


def get_bundle(name):
    return env['ir.qweb']._get_asset_bundle(name, css=False, js=True)  # noqa: F821


def reset_cold(bundle):
    """Drop caches so each timed run redoes read + transpile + minify."""
    env.cr.cache.pop('assets_js_transpiled', None)  # noqa: F821
    for asset in bundle.javascripts + bundle.templates:
        asset._content = None
        asset._converted_content = None
        asset._is_transpiled = None


def python_bundle(bundle):
    """Replica of AssetsBundle.js()'s minified branch, without DB writes."""
    content_bundle = ';\n'.join(asset.minify() for asset in bundle.javascripts)
    template_bundle = ''
    if bundle.templates:
        templates = bundle.generate_xml_bundle()
        template_bundle = textwrap.dedent(f"""

            /*******************************************
            *  Templates                               *
            *******************************************/

            odoo.define("{bundle.name}.bundle.xml", ["@web/core/templates"], function(require) {{
                "use strict";
                const {{ checkPrimaryTemplateParents, registerTemplate, registerTemplateExtension }} = require("@web/core/templates");
                /* {bundle.name} */
                {templates}
            }});
        """)
    return content_bundle + template_bundle


def rust_bundle(files, name):
    return odoo_bundler.bundle(name, files, minify_level='whitespace')['content']


def timeit(fn, n=ITERATIONS):
    samples = []
    for _ in range(n):
        start = time.perf_counter()
        fn()
        samples.append(time.perf_counter() - start)
    samples.sort()
    return min(samples), samples[len(samples) // 2], sum(samples) / len(samples)


print("=" * 72)
print(f"Rust vs Python asset bundling  ({ITERATIONS} iterations, cold caches)")
print("=" * 72)
for name in BUNDLES:
    bundle = get_bundle(name)
    if not bundle.javascripts and not bundle.templates:
        print(f"\n### {name}\n  (no JS/template assets, skipped)")
        continue
    if any(not a._filename for a in bundle.javascripts + bundle.templates):
        print(f"\n### {name}\n  (has inline/attachment assets, not Rust-bundleable, skipped)")
        continue
    files = [asset._filename for asset in bundle.javascripts + bundle.templates]

    reset_cold(bundle)
    py_out = python_bundle(bundle)
    rust_out = rust_bundle(files, name)
    for label, content in (("from_python", py_out), ("from_rust", rust_out)):
        with open(f"{OUT_DIR}/{name}.{label}.js", "w") as fh:
            fh.write(content)

    def run_python(bundle=bundle):
        reset_cold(bundle)
        python_bundle(bundle)

    py_min, py_med, _ = timeit(run_python)
    rust_min, rust_med, _ = timeit(lambda files=files, name=name: rust_bundle(files, name))

    print(f"\n### {name}")
    print(f"  files          : {len(bundle.javascripts)} JS + {len(bundle.templates)} XML templates")
    print(f"  output size    : python={len(py_out):>10,}   rust={len(rust_out):>10,} bytes")
    print(f"  Python bundling: min={py_min * 1000:8.1f} ms   median={py_med * 1000:8.1f} ms")
    print(f"  Rust   bundling: min={rust_min * 1000:8.1f} ms   median={rust_med * 1000:8.1f} ms")
    print(f"  speedup (median): {py_med / rust_med:.1f}x faster")
print("\n" + "=" * 72)
print(f"Wrote *.from_python.js / *.from_rust.js to {OUT_DIR}")
