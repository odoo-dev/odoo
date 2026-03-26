from . import models


def _post_init_hook(env):
    env["pos.order"].search(
        [("country_code", "=", "JO"), ("l10n_jo_edi_pos_uuid", "=", False)]
    )._compute_l10n_jo_edi_pos_uuid()
