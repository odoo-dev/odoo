from . import models
from . import tools


def uninstall_hook(env):
    env["res.partner"]._clear_removed_edi_formats("facturx", "zugferd")
