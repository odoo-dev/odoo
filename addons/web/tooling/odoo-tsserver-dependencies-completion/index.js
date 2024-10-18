"use strict";
function init(modules) {
    const ts = modules.typescript;
    function create(info) {
        // Get a list of things to remove from the completion list from the config object.
        // If nothing was specified, we'll just remove 'caller'
        const whatToRemove = info.config.remove || ["caller"];
        // Diagnostic logging
        info.project.projectService.logger.info("I'm getting set up now! Check the log for this message.");
        // Set up decorator object
        const proxy = Object.create(null);
        for (let k of Object.keys(info.languageService)) {
            const x = info.languageService[k];
            proxy[k] = (...args) => x.apply(info.languageService, args);
        }
        // Remove specified entries from completion list
        proxy.getCompletionsAtPosition = (fileName, position, options) => {
            const prior = info.languageService.getCompletionsAtPosition(fileName, position, options);
            if (!prior)
                return;
            const isTestFile = fileName.includes("/tests/");
            const oldLength = prior.entries.length;
            prior.entries = prior.entries.filter((e) => {
                if (!isTestFile && e.data) {
                    return (e.data.fileName || "").includes("/tests/") ? false : true;
                }
                return true;
            });
            // Sample logging for diagnostic purposes
            if (oldLength !== prior.entries.length) {
                const entriesRemoved = oldLength - prior.entries.length;
                info.project.projectService.logger.info(`Removed ${entriesRemoved} entries from the completion list`);
            }
            return prior;
        };
        return proxy;
    }
    return { create };
}
module.exports = init;
