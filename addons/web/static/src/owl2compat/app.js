(function () {
    const App = owl.App;

    const compiledTemplates = {};

    const configure = App.prototype.configure;
    App.prototype.configure = function () {
        this.templates = compiledTemplates;
        return configure.call(this, ...arguments);
    };
})();
