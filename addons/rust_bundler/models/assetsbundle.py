"""Monkey-patch ``AssetsBundle`` to bundle JS with the Rust extension.

``AssetsBundle`` is a plain Python class (not an ORM model), so it cannot be
extended through ``_inherit``. Instead we patch its ``js()`` method at import
time. Because this patch only loads when the ``rust_bundler`` module is
installed, installing the module *is* the switch: JS bundling then goes through
the ``odoo_bundler`` Rust extension. It transparently falls back to the original
Python bundler when the Rust path cannot be used (extension not importable, or
an asset with no on-disk file).
"""
import logging

from odoo.addons.base.models.assetsbundle import AssetsBundle

_logger = logging.getLogger(__name__)


def _rust_js(self, minified=True):
    """Build the JS bundle with the ``odoo_bundler`` Rust extension.

    The Rust bundler reads the source files from disk, transpiles odoo modules
    (``import`` -> ``odoo.define``), minifies, and bundles the QWeb XML
    templates, mirroring the pure-Python path in :meth:`AssetsBundle.js`.

    :return: the bundle content as a string, or ``None`` to tell the caller to
        fall back to the Python bundler (e.g. the extension is not installed, or
        an asset has no on-disk file and therefore cannot be read by Rust).
    """
    try:
        import odoo_bundler  # noqa: PLC0415
    except ImportError:
        _logger.warning(
            "The 'rust_bundler' module is installed but the 'odoo_bundler' "
            "extension is not; falling back to the Python bundler. "
            "Build it with `maturin develop --release`."
        )
        return None

    # Ordered list of on-disk paths: JS entry points first (order matters),
    # then the QWeb XML templates. The Rust bundler filters by extension and
    # emits the JS, then the templates block, like js()/generate_xml_bundle.
    files = []
    for asset in self.javascripts + self.templates:
        if not asset._filename:
            # Inline or ir.attachment-backed asset with no file on disk.
            _logger.info(
                "Asset %r has no on-disk file; falling back to the Python "
                "bundler for %r.", asset.url, self.name,
            )
            return None
        files.append(asset._filename)

    result = odoo_bundler.bundle(
        self.name,
        files,
        minify_level='whitespace' if minified else 'none',
    )
    return result['content']


_original_js = AssetsBundle.js


def js(self):
    is_minified = not self.is_debug_assets
    extension = 'min.js' if is_minified else 'js'

    if not self.get_attachments(extension):
        content_bundle = self._rust_js(minified=is_minified)
        if content_bundle is not None:
            js_attachment = self.save_attachment(extension, content_bundle)
            return js_attachment[0]

    return _original_js(self)


AssetsBundle._rust_js = _rust_js
AssetsBundle.js = js
