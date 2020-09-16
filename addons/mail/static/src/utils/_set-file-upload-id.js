/** @odoo-module alias=mail.utils._setFileUploadId **/

/**
 * Set the file upload identifier for 'upload_file' type activities
 *
 * @param {Array} activities list of activity Object
 * @return {Array} : list of modified activity Object
 */
export default function _setFileUploadId(activities) {
    for (const activity of activities) {
        if (activity.activity_category === 'upload_file') {
            activity.fileuploadID = _.uniqueId('o_fileupload');
        }
    }
    return activities;
}
