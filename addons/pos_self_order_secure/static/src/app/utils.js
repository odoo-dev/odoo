export function getTableSessionStorageKey(configId, tableIdentifier) {
    return `pos_table_session_${configId}_${tableIdentifier}_${odoo.info?.db}`;
}
