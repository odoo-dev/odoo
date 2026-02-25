import { TextLineStream } from "./deno_text_line_stream";
import { Mutex } from "@web/core/utils/concurrency";

const mutex = new Mutex();

const lines = Deno.stdin.readable
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new TextLineStream());

const reader = lines.getReader();

async function waitNextStdinLine() {
    const { value, done } = await reader.read();
    if (done) {
        // not sure.
        reader.releaseLock();
        throw new Error("No more input");
    }
    return value;
}

export async function close() {
    reader.releaseLock();
    await lines.cancel();
}

export async function sendStdStreamRequest(req) {
    // Use a mutex to prevent a deadlock.
    // We wait for the response of the previous request before sending a new one.
    // Otherwise, we might fill the stdout buffer. If the parent process is simultaneously blocked writing
    // to stdin and isn't reading our output, both processes will end up waiting for each other, causing a deadlock.
    return mutex.exec(async() => {
        Deno.stdout.write(new TextEncoder().encode(JSON.stringify(req) + "\n"));
        const response = await waitNextStdinLine();
        if (response.error) {
            console.error("RPC error", JSON.stringify(req), response.error);
        }
        return JSON.parse(response);
    })
}
