{
    'name': "Rust Asset Bundler",
    'summary': "Delegate JS asset bundling to the odoo_bundler Rust extension",
    'description': """
Rust Asset Bundler
==================

Routes Odoo's JavaScript asset bundling (transpilation, concatenation,
minification and QWeb XML template bundling) through the high-performance
``odoo_bundler`` Rust extension instead of the pure-Python implementation.

The override is applied by monkey-patching ``AssetsBundle`` at load time, so no
core file is modified. Installing this module is the only switch: once it is
installed, JS bundling goes through Rust. It falls back to the pure-Python
bundler automatically if the ``odoo_bundler`` extension is not importable, or
for an asset that has no on-disk file.

Requires the ``odoo_bundler`` Python module (built with ``maturin develop``).
""",
    'category': 'Technical',
    'version': '1.0',
    'author': 'Nicolas Bayet',
    'depends': ['base'],
    'installable': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
