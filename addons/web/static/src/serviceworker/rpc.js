/* eslint-env serviceworker */
/* eslint-disable no-restricted-globals */

const getTextFromResponse = async (response) => {
    const reader = response.clone().body.getReader();
    const decoder = new TextDecoder();
    let result = "";
    async function read() {
        const { value, done } = await reader.read();
        if (done) {
            reader.releaseLock();
            return;
        }
        result += decoder.decode(value, { stream: true });
        await read();
    }
    await read();
    return result;
};

// eslint-disable-next-line no-unused-vars
const isConnected = async () => {
    const clients = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
    // if we have some open windows on backend, we assume we are connected
    const hasBackEndTabOpen = !!clients.find((c) => new URL(c.url).pathname.startsWith("/odoo"));
    if (hasBackEndTabOpen) {
        return true;
    }
    const response = await fetch("/web/session/check", {
        headers: {
            "content-type": "application/json",
        },
        body: `{"id":1,"jsonrpc":"2.0","method":"call","params":{}}`,
        method: "POST",
    })
        .then(getTextFromResponse)
        .then(JSON.parse);
    return response.error === undefined;
};
