UPDATE
    marketplace_account
SET
    magento_base_url = 'dummy',
    magento_username = 'dummy',
    magento_password = 'dummy',
    magento_access_token = 'dummy',
    magento_store_view_code = NULL
WHERE
    channel_code = 'magento';
