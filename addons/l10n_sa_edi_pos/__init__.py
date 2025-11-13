from . import models


def post_init_hook(env):
    """
    Post-installation hook to migrate existing POS orders with account.move
    to create corresponding l10n_sa_edi.document records.

    This ensures unified status tracking for both old and new POS orders.
    """
    import logging
    _logger = logging.getLogger(__name__)

    _logger.info("Running l10n_sa_edi_pos post-installation migration...")

    # Find POS orders in Saudi Arabia that have account.move with EDI documents
    pos_orders = env['pos.order'].search([
        ('country_code', '=', 'SA'),
        ('account_move', '!=', False),
        ('state', '=', 'paid'),
    ])

    migrated_count = 0
    skipped_count = 0

    for order in pos_orders:
        # Skip if EDI document already exists for the POS order
        if order.l10n_sa_edi_document_id:
            skipped_count += 1
            continue

        # Check if the account.move has an EDI document
        move = order.account_move
        if not move or not move.l10n_sa_edi_document_id:
            skipped_count += 1
            continue

        move_edi_doc = move.l10n_sa_edi_document_id

        try:
            # Create a corresponding EDI document for the POS order
            # This allows unified tracking without disrupting the existing invoice flow
            vals = {
                'res_id': order.id,
                'res_model': 'pos.order',
                'state': move_edi_doc.state,
                'l10n_sa_chain_index': move_edi_doc.l10n_sa_chain_index,
            }

            # Copy attachment if it exists
            if move_edi_doc.attachment_id:
                attachment_copy = move_edi_doc.attachment_id.copy({
                    'res_model': 'pos.order',
                    'res_id': order.id,
                    'name': f"POS_{move_edi_doc.attachment_id.name}",
                })
                vals['attachment_id'] = attachment_copy.id

            env['l10n_sa_edi.document'].create(vals)
            migrated_count += 1

        except Exception as e:
            _logger.warning(
                "Failed to migrate EDI document for POS order %s: %s",
                order.name, str(e)
            )
            continue

    _logger.info(
        "l10n_sa_edi_pos migration completed: %d orders migrated, %d skipped",
        migrated_count, skipped_count
    )
