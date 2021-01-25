# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import os

from glob import glob
from logging import getLogger

from odoo import fields, http, models
from odoo import api

_logger = getLogger(__name__)

SCRIPT_EXTENSIONS = ['js']
STYLE_EXTENSIONS = ['css', 'scss', 'sass', 'less']
TEMPLATE_EXTENSIONS = ['xml']

# Default directive:  `file_path` or `('append', 'file_path')`
APPEND_DIRECTIVE = 'append'
# `('include', 'bundle')`
INCLUDE_DIRECTIVE = 'include'
# `('prepend', 'file_path')`
PREPEND_DIRECTIVE = 'prepend'
# `('remove', 'file_path')`
REMOVE_DIRECTIVE = 'remove'
# `('replace', 'target_path', 'file_path')`
REPLACE_DIRECTIVE = 'replace'


def fs2web(path):
    """Converts a file system path to a web path"""
    return '/'.join(path.split(os.path.sep))

def get_mime_type(file):
    """Returns the mime type related to the given file path."""
    ext = file.split('.')[-1]
    if ext in SCRIPT_EXTENSIONS:
        return 'text/javascript'
    elif ext in STYLE_EXTENSIONS:
        return 'text/%s' % ext
    return None

def get_paths(path_def, extensions, manifest_cache=None):
    """
    Returns a list of file paths matching a given glob (path_def) as well as
    the addon targetted by the path definition. If no file matches that glob,
    the path definition is returned as is. This is either because the glob is
    not correctly written or because it points to an URL.

    :param path_def: the definition (glob) of file paths to match
    :param extensions: a list of extensions that found files must match
    :returns: a tuple: the addon targetted by the path definition [0] and the
        list of glob files matching the definition [1] (or the glob itself if
        none). Note that these paths are filtered on the given `extensions`.
    """
    if manifest_cache is None:
        manifest_cache = http.addons_manifest
    paths = []
    addon = path_def.split('/')[0]
    addon_manifest = manifest_cache.get(addon)

    if addon_manifest:
        addons_path = os.path.join(addon_manifest['addons_path'], '')[:-1]
        full_path = os.path.normpath(os.path.join(addons_path, path_def))
        # When fetching template file paths, we need the full paths since xml
        # files are read from the file system. But web assets (scripts and
        # stylesheets) must be loaded using relative paths, hence the trimming
        # for non-xml file paths.
        paths = [
            path
                if path.split('.')[-1] in TEMPLATE_EXTENSIONS
                else path[len(addons_path):]
            for path in sorted(glob(full_path, recursive=True))
        ]
    else:
        addon = None

    if not len(paths):
        # No file matching the path; the path_def is considered as a URL (or a
        # miswritten glob, resulting in a console error).
        paths = [path_def]

    # Paths are filtered on the extensions (if any).
    return addon, [path
        for path in paths
        if not extensions or path.split('.')[-1] in extensions
    ]

class IrAsset(models.Model):
    """This model contributes to two things:

        1. It exposes a public function returning a list of all file paths
        declared in a given list of addons;

        2. It allows to create 'ir.asset' records to add additional directives
        to certain bundles.
    """

    _name = 'ir.asset'
    _description = 'Asset'

    @api.model_create_multi
    def create(self, vals_list):
        self.clear_caches()
        return super().create(vals_list)

    def write(self, values):
        self.clear_caches()
        return super().write(values)

    def unlink(self):
        self.clear_caches()
        return super().unlink()

    def _get_asset_domain(self, bundle):
        """Meant to be overridden to add additional parts to the search domain"""
        return [('bundle', '=', bundle), ('active', '=', True)]

    name = fields.Char(string='Name', required=True)
    bundle = fields.Char(string='Bundle name', required=True)
    directive = fields.Selection(string='Directive', selection=[
        (APPEND_DIRECTIVE, 'Append'),
        (PREPEND_DIRECTIVE, 'Prepend'),
        (REMOVE_DIRECTIVE, 'Remove'),
        (REPLACE_DIRECTIVE, 'Replace'),
        (INCLUDE_DIRECTIVE, 'Include')], default=APPEND_DIRECTIVE)
    glob = fields.Char(string='File')
    target = fields.Char(string='Target')
    active = fields.Boolean(string='active', default=True)

    def get_addon_files(self, addons, bundle, css=False, js=False, xml=False, addon_files=None, circular_path=None):
        """
        Fetches all asset file paths from a given list of addons matching a
        certain bundle. The returned list is composed of tuples containing the
        file path [1] and the first addon calling it [0]. Asset loading is
        performed as following:

        1. At each initial call (i.e. not a recursive call), a new list of
        assets is generated.

        2. The manifests of all given addons are checked for assets declaration
        for the given bundle. If any, they are read sequentially and their
        operations are applied to the current list.

        3. After all manifests have been parsed, all 'ir.asset' records
        matching the given bundle are also applied to the current list.

        :param addons: list of addon names as strings. The files returned will
            only be contained in the given addons.
        :param bundle: name of the bundle from which to fetch the file paths
        :param css: boolean: whether or not to include style files
        :param js: boolean: whether or not to include script files
        :param xml: boolean: whether or not to include template files
        :param addon_files: (addon, path)[]: the current list of loaded assets.
            It starts blank (initial) and is given to each subsequent call.
        :returns: the list of tuples (addon, file_path)
        """
        exts = []
        if js:
            exts += SCRIPT_EXTENSIONS
        if css:
            exts += STYLE_EXTENSIONS
        if xml:
            exts += TEMPLATE_EXTENSIONS

        # 1. Creates an empty assets list (if initial call).
        if addon_files is None:
            addon_files = []

        def process_path(directive, target, path_def):
            """
            This sub function is meant to take a directive and a set of
            arguments and apply them to the current addon_files list
            accordingly.

            It is nested inside `get_addon_files` since we need the current
            list of addons, extensions and addon_files.

            :param directive: string
            :param path_def: string
            """
            if not path_def:
                # 2 arguments given: no target
                path_def = target
                target = None

            if directive == INCLUDE_DIRECTIVE:
                c_path = list(circular_path) if circular_path else []
                if bundle in c_path:
                    c_path.append(bundle)  # to have a full circle in the exception
                    raise Exception('Circular assets bundle declaration: %s' % ' > '.join(c_path))
                c_path.append(bundle)
                # Recursively calls this function for each 'include' directive.
                return self.get_addon_files(addons, path_def, css, js, xml, addon_files, c_path)

            addon, paths = get_paths(path_def, exts, self._get_manifest_cache())

            if directive == REPLACE_DIRECTIVE:
                # When replacing, we need the target path to be exactly the
                # same as it was inserted. For example:
                #
                #   'web.common':  ['web/static/src/js/boot.js']
                #
                # ... will insert '/web/static/src/js/boot.js' in the files
                # list. But we would want:
                #
                #   'web.common':  [('replace', 'web/static/src/js/boot.js', 'other/static/src/js/boot.js']
                #
                # ... to replace the originally defined asset, simply because
                # it was declared like this in the first place. This is why we
                # go through the trouble of finding the exact paths matching
                # the given target glob (even though we only need the first one).
                target_addon, target_paths = get_paths(target, exts, self._get_manifest_cache())

                if not len(target_paths):
                    # The list is empty when the target path has the wrong extension.
                    # -> nothing to replace
                    return

                target_path = target_paths[0]

                if (target_addon, target_path) not in addon_files:
                    raise Exception("File %s not found in bundle %s of %s manifest" % (target_path, bundle, target_addon))

                # New file paths are inserted at the position of the target path.
                index = addon_files.index((target_addon, target_path))
                addon_files[index:index + 1] = [(addon, path) for path in paths]
                return

            # Add or remove all file paths found.
            for path in paths:
                if directive == APPEND_DIRECTIVE and (addon, path) not in addon_files:
                    # Append all file paths to the list (if not already in it).
                    addon_files.append((addon, path))
                elif directive == PREPEND_DIRECTIVE and (addon, path) not in addon_files:
                    # Prepend all file paths to the list (if not already in it).
                    addon_files.insert(0, (addon, path))
                elif directive == REMOVE_DIRECTIVE:
                    if (addon, path) not in addon_files:
                        raise Exception("File %s not found in bundle %s of %s manifest" % (path, bundle, addon))
                    # Remove all file paths from the list.
                    addon_files.remove((addon, path))

        # 2. Goes through all addons' manifests.
        for addon in addons:
            manifest = self._get_manifest_cache().get(addon)

            if not manifest:
                continue

            assets = manifest.get('assets', {})
            bundle_paths = assets.get(bundle, [])

            for path_def in bundle_paths:
                # Default directive: append
                directive = APPEND_DIRECTIVE
                target = None
                if type(path_def) == tuple:
                    # Additional directive given
                    if path_def[0] == REPLACE_DIRECTIVE:
                        directive, target, path_def = path_def
                    else:
                        directive, path_def = path_def
                process_path(directive, target, path_def)

        # 3. Goes through all 'ir.asset' records
        for asset in self.sudo().search(self._get_asset_domain(bundle)):
            process_path(asset.directive, asset.target, asset.glob)

        return addon_files

    @staticmethod
    def _get_manifest_cache():
        return http.addons_manifest
