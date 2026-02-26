const result_response_from_qlub = (transactionId, success, orderId, amount) => ({
    transactionId,
    orderId,
    status: success ? "completed" : "failed",
    amount,
    authorization_code: "AUTH123456",
    payment_method: "card",
    timestamp: 1772251201,
});

const cancel_response_from_qlub = (transactionId, orderId) => ({
    transactionId,
    orderId,
    status: "cancelled",
    reason: "user_cancelled",
    timestamp: 1772251201,
});

// Manually send requests to our controller during the tour
// To notify ourselves the result of the transaction
export async function mockQlubWebhook(action, uuid, configId, orderId, amount, success = true) {
    const transactionId = `${uuid}--${configId}`;

    const resp = await fetch(`/qlub/${transactionId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
            action === "result"
                ? result_response_from_qlub(transactionId, success, orderId, amount)
                : cancel_response_from_qlub(transactionId, orderId)
        ),
    });

    if (!resp.ok) {
        throw new Error("Failed to notify Qlub webhook");
    }
}
