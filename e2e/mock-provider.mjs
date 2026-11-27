// A fake OpenAI-compatible provider for end-to-end tests (used as Qwen and DeepSeek).
//   prompt "slow" -> streams "tick " for ~10s (to test Stop)
//   prompt "fail" -> 401
//   prompt "echo-settings" -> replies with the system prompt and sampling settings it received
//   prompt "echo: …" -> replies "You said: echo: …" (the exact prompt it received)
//   anything else -> streams "Hello from the mock!" (DeepSeek: "Hi from the second mock!")
// Non-streaming requests are judge calls: it returns a JSON verdict that prefers
// the answer containing "second", referring to answers by the judge's letters.
// GET /last-auth returns the last Authorization header; GET /health for readiness.
import http from "node:http";

const port = Number(process.env.MOCK_PORT ?? 4545);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastAuth = null;

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") return res.end("ok");
    if (req.method === "GET" && req.url === "/last-auth") return res.end(JSON.stringify({ lastAuth }));

    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const prompt = body.messages?.at(-1)?.content ?? "";
    lastAuth = req.headers.authorization ?? null;

    if (prompt === "fail") {
      res.writeHead(401, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "Invalid API key", type: "invalid_request_error" } }));
    }

    if (!body.stream) {
      const answers = [...prompt.matchAll(/<answer id="([A-Z])">\n([\s\S]*?)\n<\/answer>/g)].map((m) => ({
        id: m[1],
        text: m[2],
      }));
      const best = answers.find((a) => a.text.includes("second")) ?? answers[0];
      const verdict = {
        scores: answers.map((a) => ({
          id: a.id,
          score: a === best ? 9 : 5,
          reasoning: a === best ? `Answer ${a.id} is warm and clear.` : `Answer ${a.id} is fine but plain.`,
        })),
        winner: best?.id ?? "tie",
        summary: `Answer ${best?.id} is friendlier.`,
      };
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(
        JSON.stringify({
          id: "judge",
          object: "chat.completion",
          created: 0,
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(verdict) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 50, completion_tokens: 20, total_tokens: 70 },
        })
      );
    }

    res.writeHead(200, { "content-type": "text/event-stream" });
    let closed = false;
    res.on("close", () => (closed = true));
    const chunk = (payload) => `data: ${JSON.stringify({ id: "m", object: "chat.completion.chunk", created: 0, model: body.model, ...payload })}\n\n`;

    const system = body.messages?.find((m) => m.role === "system")?.content ?? "none";
    const echo = `system=${system} temperature=${body.temperature ?? "none"} top_p=${body.top_p ?? "none"} max_tokens=${body.max_tokens ?? "none"}`;
    const words =
      prompt === "slow"
        ? Array(50).fill("tick ")
        : prompt === "echo-settings"
          ? [echo]
          : prompt.startsWith("echo:")
            ? [`You said: ${prompt}`]
          : body.model === "deepseek-chat"
            ? ["Hi", " from", " the", " second", " mock!"]
            : ["Hello", " from", " the", " mock", "!"];
    await sleep(200);
    res.write(chunk({ choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] }));
    for (const word of words) {
      if (closed) return;
      res.write(chunk({ choices: [{ index: 0, delta: { content: word }, finish_reason: null }] }));
      await sleep(prompt === "slow" ? 200 : 30);
    }
    res.write(chunk({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
    res.write(chunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } }));
    res.end("data: [DONE]\n\n");
  })
  .listen(port, () => console.log(`mock provider on ${port}`));
