import { TextLineStream } from "./deno_text_line_stream";
import { Mutex } from "@web/core/utils/concurrency";

// Use a mutex to prevent a deadlock.
// We wait for the response of the previous request before sending a new one.
// Otherwise, we might fill the stdout buffer. If the parent process is simultaneously blocked writing
// to stdin and isn't reading our output, both processes will end up waiting for each other, causing a deadlock.
const mutex = new Mutex();

const lines = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

const reader = lines.getReader();

async function waitNextStdinLine() {
    const { value, done } = await reader.read();
    if (done) {
        reader.releaseLock();
    }
    return value;
}

export function outputToStdOut(str) {
    return mutex.exec(async() => {
        // send and do not wait for any response.
        Deno.stdout.write(new TextEncoder().encode(str));
    });
}

export function outputResult(result) {
    const msg = JSON.stringify({
        message_type: "done",
        result,
    });
    return outputToStdOut(msg + "\n");
}

export async function sendStdStreamRequest(req) {
    const msg = JSON.stringify(req);
    return mutex.exec(async() => {
        Deno.stdout.write(new TextEncoder().encode(msg + "\n"));
        const response = await waitNextStdinLine();
        if (response === undefined) {
            // EOF reached, the parent process has closed the stdin stream.
            return;
        } if (response.error) {
            console.error("RPC error", msg, response.error);
        }
        return JSON.parse(response);
    })
}
