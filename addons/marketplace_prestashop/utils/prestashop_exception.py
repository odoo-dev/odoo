class PrestashopError(Exception):
    def __init__(self, message='', error_code=False):
        """Initialize PrestashopError with message and optional error code.

        :parameters:
            message (str, optional): Error message. Defaults to empty string.
            error_code (int, optional): PrestaShop error code. Defaults to False.

        :rtype:
            None

        """
        self.error_code = error_code
        self.error_message = message

        formatted_message = ''
        if error_code:
            formatted_message = f'{error_code}:'
        if message:
            formatted_message += message

        super().__init__(formatted_message)
