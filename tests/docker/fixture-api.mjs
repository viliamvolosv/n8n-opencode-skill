import http from 'node:http';
import { randomUUID } from 'node:crypto';

const calls = [];
const json = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://fixture-api:8080');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    let body; try { body = JSON.parse(raw || '{}'); } catch { body = { text: raw }; }
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (url.pathname === '/echo') return json(res, 200, { ...body, method: req.method });
    if (url.pathname === '/uppercase') return json(res, 200, { echo: String(body.text ?? '').toUpperCase() });
    if (url.pathname === '/file') {
      const data = Buffer.from(String(body.text ?? url.searchParams.get('text') ?? 'fixture'));
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="fixture.txt"' });
      return res.end(data);
    }
    if (url.pathname.startsWith('/status/')) return json(res, Number(url.pathname.split('/').at(-1)), { error: 'fixture failure' });
    if (url.pathname === '/v1/models') return json(res, 200, { object: 'list', data: [{ id: 'fixture-model', object: 'model' }] });
    if (url.pathname === '/calls') return json(res, 200, calls);
    if (url.pathname === '/v1/chat/completions') {
      // A deterministic OpenAI protocol fixture, not an AI-quality benchmark.
      const messages = body.messages || [];
      const toolReply = messages.findLast(message => message.role === 'tool');
      const user = messages.findLast(message => message.role === 'user');
      const userText = typeof user?.content === 'string' ? user.content
        : user?.content?.filter(p => p.type === 'text').map(p => p.text).join('') || '{}';
      let input; try { input = JSON.parse(userText); } catch { input = { text: userText }; }
      const tool = body.tools?.[0]?.function;
      let message, finish_reason;
      if (!toolReply && tool) {
        const args = Object.fromEntries(Object.entries(tool.parameters?.properties || { text: { type: 'string' } })
          .map(([key, schema]) => [key, schema.type === 'object' ? input
            : key === 'query' ? JSON.stringify(input) : String(input[key] ?? input.text ?? '')]));
        message = { role: 'assistant', content: null, tool_calls: [{ id: `call_${randomUUID()}`, type: 'function',
          function: { name: tool.name, arguments: JSON.stringify(args) } }] };
        finish_reason = 'tool_calls';
      } else {
        let content = toolReply?.content ?? JSON.stringify(input);
        try {
          let parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length === 1) parsed = parsed[0];
          // n8n wraps Custom Code Tool's string return in {response: string}.
          // Expose that actual string result, not its transport envelope.
          content = parsed && Object.keys(parsed).length === 1 && typeof parsed.response === 'string'
            ? parsed.response : JSON.stringify(parsed);
        } catch {}
        message = { role: 'assistant', content: String(content) }; finish_reason = 'stop';
      }
      calls.push({ at: new Date().toISOString(), tool: tool?.name, toolExecuted: !!toolReply, stream: !!body.stream, offeredTools: body.tools?.map(t => t.function?.name), toolReplies: messages.filter(m => m.role === 'tool'), ...(toolReply ? { toolReplyContent: toolReply.content } : {}) });
      const common = { id: `chatcmpl-${randomUUID()}`, created: Math.floor(Date.now() / 1000), model: 'fixture-model' };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {
          ...message, ...(message.tool_calls ? { tool_calls: message.tool_calls.map((call, index) => ({ index, ...call })) } : {}),
        }, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ ...common, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason }] })}\n\ndata: [DONE]\n\n`);
        return res.end();
      }
      return json(res, 200, { ...common, object: 'chat.completion', choices: [{ index: 0, message, finish_reason }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    }
    json(res, 404, { error: 'Unknown fixture route' });
  } catch (error) { json(res, 500, { error: error.message }); }
}).listen(8080, '0.0.0.0', () => console.log('Local HTTP, binary and OpenAI protocol fixtures ready'));
