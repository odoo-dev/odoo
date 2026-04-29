# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo import models


class ProductCatalogMixin(models.AbstractModel):
    _inherit = 'product.catalog.mixin'

    def _create_section(self, child_field, name, *, parent_id=None, **kwargs):
        """Create a new section in order.

        :param str child_field: Field name of the order's lines (e.g., 'order_line').
        :param str name: The name of the section to create.
        :param int parent_id: The id of the parent section.
        :param dict kwargs: Additional values given for inherited models.

        :return: A dictionary with values of the created section.
        :rtype: dict
        """
        parent_field = self._get_parent_field_on_child_model()

        if not parent_field:
            return {}

        lines = self[child_field].sorted('sequence')
        line_model = lines._name
        if parent_id:
            parent_line = lines.filtered(lambda l: l.id == parent_id)
            next_section = lines.filtered(
                lambda l: l.display_type == 'line_section' and l.sequence > parent_line.sequence
            )[:1]
            sequence = next_section.sequence - 1 if next_section else (
                lines[-1].sequence + 1 if lines else 10
            )
        else:
            sequence = lines[-1].sequence + 1 if lines else 10

        section = self.env[line_model].create({
            parent_field: self.id,
            'name': name,
            'display_type': 'line_subsection' if parent_id else 'line_section',
            'sequence': sequence,
            **self._get_default_create_section_values(),
        })

        return {
            'id': section.id,
            'sequence': section.sequence,
            'display_type': section.display_type,
            'subtotal': 0.0,
            'currency_id': self.currency_id.id,
            **self._get_extra_values_for_section(section),
        }

    def _get_new_line_sequence(self, child_field, section_id):
        """Compute the sequence number for inserting a new line into the order.

        :param str child_field: Field name of the order's lines (e.g., 'order_line').
        :param int section_id: ID of the section line to insert after.
        :rtype: int
        :return: Computed sequence number.
        """
        lines = self[child_field].sorted('sequence')

        if section_id:
            # Insert after the selected section line
            sequence = lines.filtered_domain([
                ('display_type', 'in', ['line_section', 'line_subsection']),
                ('id', '=', section_id),
            ]).sequence + 1
        elif (
            section_lines := lines.filtered_domain([
                ('display_type', '=', 'line_section'),
            ])
        ):
            # Insert before the first section (top of the order)
            sequence = section_lines[0].sequence
        else:
            # No sections exist, insert at the end
            sequence = (lines and lines[-1].sequence + 1) or 10

        for line in lines.filtered_domain([('sequence', '>=', sequence)]):
            line.sequence += 1

        return sequence

    def _get_sections(self, child_field, **kwargs):
        """Return section data for the product catalog display.

        :param str child_field: Field name of the order's lines (e.g., 'order_line').
        :param dict kwargs: Additional values given for inherited models.
        :rtype: list
        :return: List of section dicts with 'id', 'name', 'sequence', 'parent_id', 'display_type',
                 'subtotal' and 'currency_id' + any additional values given by inherited models.
        """
        sections = {}
        no_section_subtotal = 0.0
        lines = self[child_field]
        for line in lines.sorted('sequence'):
            if line.display_type in ('line_section', 'line_subsection'):
                values = {
                    'id': line.id,
                    'name': line.name,
                    'sequence': line.sequence,
                    'parent_id': line.parent_id.id if line.parent_id else False,
                    'display_type': line.display_type,
                    'subtotal': line.get_section_subtotal(),
                    'currency_id': self.currency_id.id,
                }
                values.update(self._get_extra_values_for_section(line))
                sections[line.id] = values

            elif not line.parent_id:
                no_section_subtotal += line.price_subtotal

        sections[False] = {
            'id': False,
            'name': self.env._("No Section"),
            'sequence': lines[0].sequence - 1 if lines else 0,
            'parent_id': False,
            'display_type': False,
            'subtotal': no_section_subtotal,
            'currency_id': self.currency_id.id,
        }

        return sorted(sections.values(), key=lambda x: x['sequence'])

    def _get_default_create_section_values(self):
        """Return default values for creating a new section in order through catalog.

        :return: A dictionary with default values for creating a new section.
        :rtype: dict
        """
        return {}

    def _get_extra_values_for_section(self, line):
        """Return extra values to display in the section for the product catalog.

        :param recordset line: A record of a section line.
        :return: A dictionary with extra values to display in the catalog.
        :rtype: dict
        """
        return {}

    def _get_parent_field_on_child_model(self):
        """Return the parent field for the order lines.

        :return: parent field
        :rtype: str
        """
        return ''

    def _resequence_sections(
        self,
        child_field,
        moved_section_id,
        new_parent_section_id,
        *,
        insert_before_section_id=None,
        **kwargs
    ):
        """Reorder the sections.

        :param str child_field: Field name of the order's lines (e.g., 'order_line').
        :param int moved_section_id: ID of the section to move.
        :param int new_parent_section_id: ID of the new parent section.
        :param int insert_before_section_id: ID of the section to insert before.
        :param dict kwargs: Additional values given for inherited models.
        """
        lines = self[child_field].sorted("sequence")
        section = lines.browse(moved_section_id)

        if not section:
            return

        # Get Subtree of moved section
        def _get_subtree(node, ordered_lines):
            result = self.env[node._name].browse()
            collecting = False
            parent_stack = {node.id}

            for line in ordered_lines:
                if line.id == node.id:
                    collecting = True
                    result |= line
                    continue

                if not collecting:
                    continue

                if line.parent_id.id in parent_stack:
                    result |= line
                    parent_stack.add(line.id)
                else:
                    break

            return result

        subtree = _get_subtree(section, lines)

        # Prevent moving a section inside its own subtree
        if new_parent_section_id and new_parent_section_id in subtree.ids:
            return

        # Remove subtree to compute new order
        remaining = lines - subtree

        section.parent_id = new_parent_section_id or False

        # Compute insert index
        insert_index = None

        # Case 1: use insert_before_section_id (highest priority)
        if insert_before_section_id:
            for i, line in enumerate(remaining):
                if line.id == insert_before_section_id:
                    insert_index = i
                    break

        # Case 2: insert inside parent (as last child)
        elif new_parent_section_id:
            parent = lines.browse(new_parent_section_id)
            parent_subtree = _get_subtree(parent, lines)
            last_line = parent_subtree[-1]

            for i, line in enumerate(remaining):
                if line.id == last_line.id:
                    insert_index = i + 1
                    break

        # Case 3: fallback
        if insert_index is None:
            insert_index = len(remaining)

        # Special case: if inserting at the end but there are siblings after removal, insert before
        # the first sibling
        if not new_parent_section_id:
            if insert_index < len(remaining):
                next_line = remaining[insert_index]

                if next_line.parent_id:
                    ancestor = next_line
                    while ancestor.parent_id:
                        ancestor = ancestor.parent_id

                    for i, line in enumerate(remaining):
                        if line.id == ancestor.id:
                            insert_index = i
                            break

        new_list = (
            remaining[:insert_index]
            | subtree
            | remaining[insert_index:]
        )

        for seq, line in enumerate(new_list, start=1):
            line.sequence = seq

    def _duplicate_section(self, child_field, section_id, *, parent_id=None, **kwargs):
        """Duplicate the given section with all its children.

        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        :param int parent_id: The id of the parent section for the duplicated section.
        :param dict kwargs: Additional values given for inherited models.
        :return: The id of the duplicated section.
        :rtype: int
        """
        lines = self[child_field]

        if parent_id:
            section_lines = lines.filtered(
                lambda l: l.id == section_id or l.parent_id.id == section_id
            )
        else:
            section_lines = lines.filtered(
                lambda l: l.id == section_id
                or l.get_parent_section_line().id == section_id
            )

        section_lines = section_lines.sorted("sequence")

        # If duplicating a section with children, insert the duplicated block after the last child
        # to keep them together.
        anchor = section_lines[-1]

        ordered_lines = lines.sorted(lambda l: (l.sequence, l.id))

        anchor_index = ordered_lines.ids.index(anchor.id)

        # Lines after anchor (including same sequence ones)
        to_shift = ordered_lines[anchor_index + 1:]

        shift_by = len(section_lines) + 1

        # Shift sequences
        for line in to_shift:
            line.sequence += shift_by

        # Insert duplicated block
        base_sequence = anchor.sequence + 1

        commands = []
        for i, line in enumerate(section_lines):
            vals = line.copy_data()[0]
            vals["sequence"] = base_sequence + i
            commands.append((0, 0, vals))

        existing_ids = set(lines.ids)

        self.write({child_field: commands})

        return self[child_field].filtered(
            lambda line: line.id not in existing_ids
        ).sorted("sequence")[0].id

    def _delete_section(self, child_field, section_id, **kwargs):
        """Delete the given section with all its children.

        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        :param dict kwargs: Additional values given for inherited models.
        """
        lines = self[child_field]
        section = lines.browse(section_id)

        if not section:
            return

        # Find all lines to delete (section + children)
        if section.display_type == "line_section":
            lines_to_delete = lines.filtered(
                lambda l: l.id == section_id
                or l.get_parent_section_line().id == section_id
            )
        else:
            lines_to_delete = lines.filtered(
                lambda l: l.id == section_id
                or l.parent_id.id == section_id
            )

        lines_to_delete.unlink()

    def _rename_section(self, child_field, section_id, new_name, **kwargs):
        section = self[child_field].browse(section_id)
        if section:
            section.name = new_name

    def _toggle_field_of_section(self, child_field, section_id, field_name, **kwargs):
        """Toggle the given field of the given section.

        :param string child_field: The field name of the lines in the order model.
        :param int section_id: The section id.
        :param string field_name: The name of the field to toggle.
        :param dict kwargs: Additional values given for inherited models.
        """
        section = self[child_field].browse(section_id)
        if (
            not section.exists()
            or field_name not in self._get_extra_values_for_section(section)
        ):
            return

        section[field_name] = not section[field_name]
