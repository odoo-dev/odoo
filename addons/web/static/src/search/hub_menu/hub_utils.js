export function openHubItem(actionPlugin, item, {resModel, resId}, options = {}){
    if (item.action_id) {
       return actionPlugin.doAction(item.action_id[0], {
            additionalContext: {
                active_id: resId,
                active_ids: [resId],
                active_model: resModel
            },
            ...options
        })
    } else {
        return actionPlugin.doActionButton({
            type: "object",
            name: item.python_method,
            resModel,
            resId,
            ...options
        });
    }
}
