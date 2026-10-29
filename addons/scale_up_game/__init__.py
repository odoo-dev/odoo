from . import models


def post_init_hook(env):
    """Seed the training stock once (idempotent: guarded by initial_stock_done)."""
    env['scale.up.game.level']._init_scenario_stock()
