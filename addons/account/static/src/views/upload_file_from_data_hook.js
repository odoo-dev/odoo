import { rpc } from "@web/core/network/rpc";


// Supported file types we need extract on paste
const supportedFileTypes = ["text/xml", "application/pdf"];

/**
 * Return function to extract and upload from given dataTransfer.
 *
 * @param {dataTransfer} dataTransfer containing text or files.
 */
export function uploadFileFromData(dataTransfer) {
    return async (dataTransfer) => {
        function isValidUrl(text) {
            try {
                const { protocol } = new URL(text);
                if (protocol === 'https:') {
                    return true;
                }
                console.warn("Not a secure url.");
            } catch {
                console.warn("Invalid url.");
            }
        }

        function uploadFiles(dataTransfer) {
            const invalidFiles = [...dataTransfer.items].filter(
                (item) => item.kind !== "file" || !supportedFileTypes.includes(item.type)
            );
            if (invalidFiles.length !== 0) {
                // don't upload any files if one of them is non supported file type
                console.warn("Invalid files to extract details.");
                return;
            }
            let uploadInput = document.querySelector('.document_file_uploader.o_input_file');
            uploadInput.files = dataTransfer.files;
            uploadInput.dispatchEvent(new Event("change"));
        }

        async function uploadFileFromUrl(url) {
            const response = await rpc("/account/get_file_from_url", {
                url: url,
            });
            if (!response) {
                console.warn("Invalid url to extract documents.");
                return;
            }
            if (supportedFileTypes.includes(response.content_type)) {
                const dataTransfer = new DataTransfer();
                const file = new File([response.content], response.file_name, { type: response.content_type});
                dataTransfer.items.add(file);
                uploadFiles(dataTransfer);
                return;
            }
            console.warn("Unsupported file type to extract documents.");
        }

        const text = dataTransfer.getData("text/plain");
        if (dataTransfer.files.length !== 0) {
            uploadFiles(dataTransfer);
        } else if (isValidUrl(text)) {
            await uploadFileFromUrl(text);
        } else {
            console.warn("Invalid data to extract details.");
        }
    }
}
