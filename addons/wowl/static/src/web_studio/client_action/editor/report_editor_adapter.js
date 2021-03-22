/** @odoo-module **/
import { ComponentAdapter } from "web.OwlCompatibility";
import ReportEditorManager from "web_studio.ReportEditorManager";
import { useService } from '@wowl/core/hooks';

class ReportEditorAdapter extends ComponentAdapter {
    constructor(parent, props) {
        props.Component = ReportEditorManager;
        super(...arguments);
        this.user = useService('user');
        this.rpc = useService('rpc');
        this.orm = useService('orm');
        this.studio = useService('studio');
        this.reportEnv = {};
        this.env = owl.Component.env;
    }

    get handle() {
        return this.studio.editedReport;
    }

    async willStart() {
        const proms = [];
        proms.push(this._readReport().then(() => this._loadEnvironment()));
        proms.push(this._readModels());
        proms.push(this._readWidgetsOptions());
        proms.push(this._getReportViews());
        proms.push(this._readPaperFormat());
        await Promise.all(proms);
        return super.willStart();
    }

    get widgetArgs() {
        return [{
            env: this.reportEnv,
            //initialState: state,
            models: this.models,
            paperFormat: this.paperFormat,
            report: this.report,
            reportHTML: this.reportViews.report_html,
            reportMainViewID: this.reportViews.main_view_id,
            reportViews: this.reportViews.views,
            widgetsOptions: this.widgetsOptions,
        }];
    }


    /**
     * Load and set the report environment.
     *
     * If the report is associated to the same model as the Studio action, the
     * action ids will be used ; otherwise a search on the report model will be
     * performed.
     *
     * @private
     * @returns {Promise}
     */
    async _loadEnvironment() {
        this.reportEnv.modelName = this.report.model;

        // TODO: Since 13.0, journal entries are also considered as 'account.move',
        // therefore must filter result to remove them; otherwise not possible
        // to print invoices and hard to lookup for them if lot of journal entries.
        var domain = [];
        if (this.report.model === 'account.move') {
            domain = [
                ['move_type', '!=', 'entry']
            ];
        }

        const result = await this.orm.search(
            this.report.model,
            domain,
            undefined,
            this.user.context,
        );
        this.reportEnv.ids = result;
        this.reportEnv.currentId = this.reportEnv.ids && this.reportEnv.ids[0];
    }
    /**
     * Read the models (ir.model) name and model to display them in a
     * user-friendly way in the sidebar (see AbstractReportComponent).
     *
     * @private
     * @returns {Promise}
     */
    async _readModels() {
        const models = await this.orm.searchRead(
            'ir.model',
            [
                ['transient', '=', false]
            ], // abstract is defined in studio:['abstract', '=', false]],
            ['name', 'model'],
            undefined,
            this.user.context,
        );
        this.models = {};
        models.forEach((model) => {
            this.models[model.model] = model.name;
        });
    }
    /**
     * @private
     * @returns {Promise}
     */
    async _readReport() {
        const result = await this.orm.read(
            'ir.actions.report',
            [this.handle.res_id],
            undefined,
            this.user.context
        );
        this.report = result[0];
    }
    /**
     * @private
     * @returns {Promise}
     */
    async _readPaperFormat() {
        this.paperFormat = 'A4';
        return Promise.resolve();
        const result = await this.rpc('/web_studio/read_paperformat', {
            report_id: this.handle.res_id,
            context: this.user.context,
        });
        this.paperFormat = result[0];
    }
    /**
     * Load the widgets options for t-options directive in sidebar.
     *
     * @private
     * @returns {Promise}
     */
    async _readWidgetsOptions() {
        this.widgetsOptions = {};
        return Promise.resolve();
        this.widgetsOptions = await this.rpc('/web_studio/get_widgets_available_options', {
            context: this.user.context,
        });
    }
    /**
     * @private
     * @returns {Promise<Object>}
     */
    async _getReportViews() {
        this.reportViews = {
            'report_html': "",
            'main_view_id': false,
            'views': {},
        };
        return Promise.resolve();
        this.reportViews = await this.rpc('/web_studio/get_report_views', {
            record_id: this.env.currentId,
            report_name: this.reportName,
            context: this.user.context,
        });
    }
}

// We need this to wrap in a div
// ViewEditor doesn't need this because it extends AbstractEditor, and defines a template
export class ReportEditor extends owl.Component {};
ReportEditor.template = owl.tags.xml`<div><ReportEditorAdapter /></div>`;
ReportEditor.components = { ReportEditorAdapter };
