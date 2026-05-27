from . import models
from . import wizard


def uninstall_hook(env):
    env["res.partner"]._clear_removed_edi_formats(
        "facturx",
        "nlcius",
        "ubl_bis3",
        "xrechnung",
    )
