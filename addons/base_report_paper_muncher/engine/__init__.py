# Part of Odoo. See LICENSE file for full copyright and licensing details.

"""The :mod:`odoo.addons.base_report_paper_muncher.engine` module
provides the core functionality for rendering documents
using the Paper Muncher engine.
It includes the main rendering functions and utilities
for managing the rendering process.
"""


from .paper_muncher import rendered, render
from .utils.binary import can_use_paper_muncher
