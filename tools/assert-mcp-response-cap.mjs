// #147: a single MCP stdio response must stay under the client's line limit.
// The fix is an output cap at the handler boundary, not chunking (JSON-RPC over
// stdio is line-delimited) and not touching normalizeDisabledTools (which never
// serialises anything).
import assert from "node:assert/strict";
import { createMcpHandler, responseCapChars, responseCapBytes, clipResponse, perDocumentBudget } from "../lib/mcp_server.js";

let checks = 0;
const check = async (name, fn) => {
  await fn();
  checks++;
  console.log(`  ok  ${name}`);
};

const withEnv = async (value, fn) => {
  const previous = process.env.MCP_MAX_RESPONSE_CHARS;
  if (value === undefined) delete process.env.MCP_MAX_RESPONSE_CHARS;
  else process.env.MCP_MAX_RESPONSE_CHARS = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.MCP_MAX_RESPONSE_CHARS;
    else process.env.MCP_MAX_RESPONSE_CHARS = previous;
  }
};

const callTool = async (handler, name, args = {}) =>
  handler({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });

await check("the cap defaults to 48000 and honours the environment", async () => {
  await withEnv(undefined, () => {
    assert.equal(responseCapChars(), 48000);
  });
  await withEnv("1200", () => {
    assert.equal(responseCapChars(), 1200);
  });
  await withEnv("0", () => {
    assert.equal(responseCapChars(), 0);
  });
  await withEnv("-5", () => {
    assert.equal(responseCapChars(), 48000);
  });
  await withEnv("nope", () => {
    assert.equal(responseCapChars(), 48000);
  });
});

await check("short text is returned untouched", async () => {
  await withEnv("100", () => {
    assert.equal(clipResponse("hello"), "hello");
    assert.equal(clipResponse(""), "");
  });
});

await check("long text is truncated with a note naming the env var", async () => {
  await withEnv("100", () => {
    const clipped = clipResponse("x".repeat(500));
    assert.equal(clipped.length, 100);
    assert.match(clipped, /truncated to 100 characters/);
    assert.match(clipped, /MCP_MAX_RESPONSE_CHARS/);
  });
});

await check("char and byte caps of 0 both disable truncation", async () => {
  const previousBytes = process.env.MCP_MAX_RESPONSE_BYTES;
  process.env.MCP_MAX_RESPONSE_BYTES = "0";
  try {
    await withEnv("0", () => {
      const text = "y".repeat(90000);
      assert.equal(clipResponse(text), text);
    });
  } finally {
    if (previousBytes === undefined) delete process.env.MCP_MAX_RESPONSE_BYTES;
    else process.env.MCP_MAX_RESPONSE_BYTES = previousBytes;
  }
});

await check("the byte cap still protects the line when only the char cap is off", async () => {
  const previousBytes = process.env.MCP_MAX_RESPONSE_BYTES;
  process.env.MCP_MAX_RESPONSE_BYTES = "4096";
  try {
    await withEnv("0", () => {
      const clipped = clipResponse("y".repeat(90000));
      assert.ok(Buffer.byteLength(clipped, "utf8") <= 4096, `got ${Buffer.byteLength(clipped, "utf8")} bytes`);
    });
  } finally {
    if (previousBytes === undefined) delete process.env.MCP_MAX_RESPONSE_BYTES;
    else process.env.MCP_MAX_RESPONSE_BYTES = previousBytes;
  }
});

await check("the handler clips every tool result, including injected ones", async () => {
  await withEnv("500", async () => {
    const handler = createMcpHandler({
      fetchPage: async () => "z".repeat(5000),
      search: async () => ({ engine: "exa", sources: [] }),
      version: "test",
    });
    const response = await callTool(handler, "web_fetch", { url: "https://example.com" });
    const text = response.result.content[0].text;
    assert.equal(text.length, 500);
    assert.match(text, /truncated to 500 characters/);
  });
});

await check("the handler clips tool errors too", async () => {
  await withEnv("120", async () => {
    const handler = createMcpHandler({
      fetchPage: async () => {
        throw new Error("E".repeat(2000));
      },
      version: "test",
    });
    const response = await callTool(handler, "web_fetch", { url: "https://example.com" });
    assert.equal(response.result.isError, true);
    const text = response.result.content[0].text;
    assert.equal(text.length, 120);
    assert.match(text, /truncated to 120 characters/);
  });
});

await check("web_fetch shrinks max_chars to the cap instead of building a huge body first", async () => {
  await withEnv("700", async () => {
    const fs = await import("node:fs");
    const source = fs.readFileSync(new URL("../lib/mcp_server.js", import.meta.url), "utf8");
    assert.match(source, /const cap = responseCapChars\(\)/);
    assert.match(source, /const maxChars = cap === 0 \? requested : Math\.min\(requested, cap\)/);
  });
});

await check("a large default-sized response stays under 64KB", async () => {
  await withEnv(undefined, async () => {
    const handler = createMcpHandler({
      fetchPage: async () => "q".repeat(200000),
      version: "test",
    });
    const response = await callTool(handler, "web_fetch", { url: "https://example.com" });
    const line = JSON.stringify(response);
    assert.ok(line.length < 65536, `response line is ${line.length} bytes`);
  });
});

await check("the byte budget keeps multi-byte text under the 64KB stdio line", async () => {
  const previous = process.env.MCP_MAX_RESPONSE_BYTES;
  delete process.env.MCP_MAX_RESPONSE_BYTES;
  try {
    // 40k CJK characters are ~120KB in UTF-8; the char cap alone would let them
    // through and still break the client's 64KB line buffer.
    const text = "中".repeat(40000);
    const clipped = clipResponse(text);
    const line = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: clipped }] } });
    assert.ok(Buffer.byteLength(line, "utf8") < 65536, `line is ${Buffer.byteLength(line, "utf8")} bytes`);
    assert.match(clipped, /truncated to/);
  } finally {
    if (previous === undefined) delete process.env.MCP_MAX_RESPONSE_BYTES;
    else process.env.MCP_MAX_RESPONSE_BYTES = previous;
  }
});

await check("the byte budget honours its environment override and 0", async () => {
  const previous = process.env.MCP_MAX_RESPONSE_BYTES;
  try {
    process.env.MCP_MAX_RESPONSE_BYTES = "2000";
    assert.equal(responseCapBytes(), 2000);
    assert.ok(Buffer.byteLength(clipResponse("中".repeat(5000)), "utf8") <= 2000);
    process.env.MCP_MAX_RESPONSE_BYTES = "0";
    assert.equal(responseCapBytes(), 0);
    assert.equal(clipResponse("中".repeat(5000)), "中".repeat(5000));
  } finally {
    if (previous === undefined) delete process.env.MCP_MAX_RESPONSE_BYTES;
    else process.env.MCP_MAX_RESPONSE_BYTES = previous;
  }
});

await check("research sizes each document from the remaining response budget", async () => {
  await withEnv("9000", async () => {
    const budget = perDocumentBudget(8);
    assert.ok(budget > 0, "budget must leave room for content");
    assert.ok(budget * 8 <= 9000, `8 documents must fit the cap (${budget * 8})`);
  });
  await withEnv("0", async () => {
    assert.equal(perDocumentBudget(8), 8000);
  });
});

console.log(`OK: ${checks} mcp response-cap checks passed`);
