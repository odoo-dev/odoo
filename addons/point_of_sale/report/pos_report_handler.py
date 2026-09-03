from __future__ import annotations

import inspect

from odoo import api, models
from odoo.exceptions import ValidationError


def report_section(*, id=None, parent=None, sequence=1, name=None, foldability="collapsed"):
    """Decorator for defining a report section.

    :param str id: Unique section ID (required).
    :param str parent: Parent section ID, if nested.
    :param str name: Section display name.
    :param int sequence: Display order.
    :param str foldability: "static", "collapsed", or "expanded".
    """
    if not id:
        raise ValueError("report_section: 'id' is required.")

    def decorator(fn):
        fn._rs_id = id
        fn._rs_name = name
        fn._rs_parent = parent
        fn._rs_sequence = sequence
        fn._rs_foldability = foldability
        return fn

    return decorator


class PosReportHandler(models.AbstractModel):
    _name = 'pos.report.handler'
    _description = 'POS Report Handler'

    def _get_filters(self):
        return []

    def _get_sections_columns(self):
        return {}

    def _get_sections_meta(self):
        columns_by_section = self._get_sections_columns()
        return [
            {
                'id': fn._rs_id,
                'name': fn._rs_name,
                'foldability': self._compute_section_foldability(fn),
                'columns': columns_by_section.get(fn._rs_id, []),
            }
            for fn in self._get_section_methods()
        ]

    def _get_sections_data(self, options=None):
        """Return section data with metadata (columns, foldability, etc.)"""
        sections = []
        columns_by_section = self._get_sections_columns()
        for fn in self._get_section_methods():
            lines = fn(self, options)
            normalized = self._normalize_lines(fn, lines)
            if not normalized:
                continue

            columns = columns_by_section.get(fn._rs_id, [])

            for line in normalized:
                line['columns'] = columns
                sections.append(line)
        return sections

    def _get_unfold_lines(self, section_id, record_id=None, options=None):
        children = self._get_section_methods(section_id)
        if not children:
            return []

        unfold_context = {'section_id': section_id, 'record_id': record_id}
        result = []
        for fn in children:
            result.extend(self._normalize_lines(fn, fn(self, unfold_context, options)))
        return result
    
    @api.ormcache('parent_section_id', cache='stable')
    def _get_section_methods(self, parent_section_id=None):
        sections = [
            method
            for _, method in inspect.getmembers(type(self), inspect.isfunction)
            if hasattr(method, '_rs_id')
        ]

        if parent_section_id is not None:
            return sorted(
                (method for method in sections if method._rs_parent == parent_section_id),
                key=lambda method: method._rs_sequence,
            )

        return sorted(
            (method for method in sections if method._rs_parent is None),
            key=lambda method: method._rs_sequence,
        )

    def _compute_section_foldability(self, fn):
        if not self._get_section_methods(fn._rs_id):
            return "static"
        return getattr(fn, '_rs_foldability', "collapsed")

    @staticmethod
    def _normalize_lines(fn, lines):
        """Normalize and shape lines returned by a section method"""
        if lines is None:
            return []
        if not isinstance(lines, list):
            lines = [lines]

        structural_keys = {
            'record_id', 'section_id', 'name', 'level',
            'foldability', 'style', 'sequence', 'lines', 'columns',
        }
        result = []
        for line in lines:
            result.append({
                'section_id': fn._rs_id,
                'record_id': line.get('record_id'),
                'name': line.get('name', fn._rs_name),
                'sequence': line.get('sequence', fn._rs_sequence),
                'level': line.get('level', 0),
                'foldability': line.get('foldability', fn._rs_foldability),
                'style': line.get('style'),
                'values': {k: v for k, v in line.items() if k not in structural_keys},
                'lines': [],
            })
        return result

    def _register_hook(self):
        self._validate_sections()
        return super()._register_hook()

    def _validate_sections(self):
        sections = {}
        for _, fn in inspect.getmembers(type(self), inspect.isfunction):
            if not hasattr(fn, '_rs_id'):
                continue

            sid = fn._rs_id
            if sid in sections:
                raise ValidationError(
                    "Duplicate section ID '%s' found on method '%s'." % (sid, fn.__name__)
                )
            sections[sid] = fn

        for sid, fn in sections.items():
            parent = fn._rs_parent

            if parent is not None and parent not in sections:
                raise ValidationError(
                    "Section '%s' (method '%s') references parent '%s' which does not exist."
                    % (sid, fn.__name__, parent)
                )
