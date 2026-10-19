import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { appendFileSync } from 'node:fs';

// Records transport metadata only: never headers, prompts, replies or credentials.
export async function startGatewayDiagnostics({ upstream, output }) {
  let sequence = 0;
  const record = data => appendFileSync(output, JSON.stringify({ time: new Date().toISOString(), ...data }) + '\n');
  const server = createServer(async (request, response) => {
    const id = ++sequence;
    const started = Date.now();
    let receivedBytes = 0;
    let lastChunkAt;
    const progress = setInterval(() => record({ id, event: 'progress', elapsedMs: Date.now() - started, receivedBytes, idleMs: lastChunkAt ? Date.now() - lastChunkAt : null }), 15000);
    progress.unref();
    response.on('close', () => clearInterval(progress));
    record({ id, event: 'request', method: request.method, path: request.url?.split('?')[0] });
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const headers = { ...request.headers };
      delete headers.host; delete headers.connection; delete headers['content-length'];
      const result = await fetch(upstream + request.url, {
        method: request.method, headers,
        ...(body.length ? { body } : {}), signal: AbortSignal.timeout(350000),
      });
      record({ id, event: 'response_headers', status: result.status, elapsedMs: Date.now() - started, requestBytes: body.length, retryAfter: result.headers.get('retry-after') });
      const responseHeaders = { 'content-type': result.headers.get('content-type') || 'application/json' };
      for (const name of ['retry-after', 'x-request-id']) {
        const value = result.headers.get(name);
        if (value) responseHeaders[name] = value;
      }
      response.writeHead(result.status, responseHeaders);
      if (result.body) {
        const stream = Readable.fromWeb(result.body);
        stream.on('data', chunk => { receivedBytes += chunk.length; lastChunkAt = Date.now(); });
        stream.on('error', error => {
          record({ id, event: 'upstream_stream_error', errorType: error.name, code: error.cause?.code, elapsedMs: Date.now() - started, receivedBytes });
          response.destroy();
        });
        stream.on('end', () => record({ id, event: 'upstream_end', elapsedMs: Date.now() - started, receivedBytes }));
        response.on('close', () => { if (!stream.readableEnded) stream.destroy(); });
        stream.pipe(response);
      } else response.end();
    } catch (error) {
      record({ id, event: 'upstream_error', errorType: error.name, code: error.cause?.code, elapsedMs: Date.now() - started, receivedBytes });
      if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' });
      response.end('{"error":{"message":"Diagnostic gateway upstream transport failed"}}');
    }
    response.on('close', () => record({ id, event: 'client_closed', complete: response.writableFinished, elapsedMs: Date.now() - started, receivedBytes }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, close() { server.closeAllConnections(); server.close(); } };
}
