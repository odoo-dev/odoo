/** @odoo-module */

const { Component, hooks } = owl;

export class FileUploader extends Component {
  constructor() {
    super(...arguments);
    this._fileInputRef = hooks.useRef('fileInput');
  }

  chooseFiles() {
    this._fileInputRef.el.click();
  }

  _onChangedFiles(ev) {
    this.uploadFiles(this._fileInputRef.el.files);
  }

  async uploadFiles(files) {
    let res = await this._performUpload(files);
    if (this.props.onUploaded) {
      if (!this.props.multiUpload) {
        res = res[0];
      }
      this.props.onUploaded(res);
    }
    this._fileInputRef.el.value = '';
  }
  /**
   * @private
   * @param {FileList|Array} files
   * @returns {Promise}
   */
  async _performUpload(files) {
    const url = this.props.fileUploadUrl || '/web/binary/upload';
    let results = [];
    for (const file of files) {
      try {
        const response = await this.env.browser.fetch(url, {
          method: 'POST',
          body: this._createFormData(file),
        });
        let html = await response.text();
        const template = document.createElement('template');
        template.innerHTML = html.trim();
        results = results.concat(JSON.parse(template.content.firstChild.textContent));
      } catch (e) {
        if (e.name !== 'AbortError') {
          throw e;
        }
        results.push({error: e});
      }
    }
    return results;
  }
  /**
   * @private
   * @param {File} file
   * @returns {FormData}
   */
  _createFormData(file) {
      let formData = new window.FormData();
      formData.append('csrf_token', odoo.csrf_token);
      formData.append('ufile', file);
      if (this.props.uploadParams) {
        Object.entries(this.props.uploadParams).forEach(([k, v]) => {
          formData.append(k, v);
        });
      }
      return formData;
  }
}
FileUploader.template = "wowl.FileUploader";
FileUploader.defaultProps = {
  withLabel: true,
};
