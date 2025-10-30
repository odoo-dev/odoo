/** @odoo-module **/

/**
 * Parses a timestamp in the format HH:MM:SS,ms into seconds.
 * @param {string} timestamp
 * @returns {number}
 **/
function parseTimestamp(timestamp) {
    const parts = timestamp.split(":");
    const secondsParts = parts[2].split(",");
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(secondsParts[0], 10);
    const milliseconds = parseInt(secondsParts[1], 10);
    return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

/**
 * Parses an SRT (SubRip Text) file content into a structured array.
 * @param {string} srtContent The raw SRT string.
 * @returns {Array<Object>} An array of subtitle objects, e.g.,
 *   [{ startTime: 1.234, endTime: 3.456, text: "Hello world" }, ...]
 **/
export function parseSRT(srtContent) {
    if (!srtContent) {
        return [];
    }
    const blocks = srtContent.trim().split(/\n\s*\n/);
    return blocks
        .map((block) => {
            const lines = block.split("\n");
            if (lines.length < 3) {
                return null;
            }
            const timestampLine = lines[1];
            const [start, end] = timestampLine.split(" --> ");
            if (!start || !end) {
                return null;
            }
            // Check if both start and end look like valid full timestamps before parsing
            if (!start.includes(',') || !end.includes(',') || start.split(':').length < 3 || end.split(':').length < 3) {
                return null;
            }
            const text = lines.slice(2).join("\n");
            return {
                startTime: parseTimestamp(start.trim()),
                endTime: parseTimestamp(end.trim()),
                text: text,
            };
        })
        .filter(Boolean); // Filter out any null (invalid) blocks
}
