import test from "node:test";
import assert from "node:assert/strict";
import { workerClient } from "../scripts/lib/artwork-client.mjs";

const env = {
  ARTWORK_API_URL: "https://script.google.com/macros/s/test/exec",
  ARTWORK_SITE_ID: "test",
  ARTWORK_WORKER_SECRET: "a".repeat(48),
};
const resultUrl = "https://script.googleusercontent.com/macros/echo?user_content_key=test-result";

test("GAS 結果轉址只送 GET，HTML 或暫時錯誤只重讀結果、不重送寫入", async () => {
  const calls = [];
  const responses = [
    new Response(null, { status: 302, headers: { location: resultUrl } }),
    new Response("<html>temporary</html>"),
    new Response("unavailable", { status: 503 }),
    Response.json({ ok: true, data: { job: null } }),
  ];
  const client = workerClient(
    env,
    async (url, options) => {
      calls.push({ url, options });
      return responses.shift();
    },
    async () => {},
  );
  assert.deepEqual(await client("claim", { owner: "1:1" }), { job: null });
  assert.equal(calls.filter((call) => call.options.method === "POST").length, 1);
  assert.equal(calls[0].options.redirect, "manual");
  for (const call of calls.slice(1)) {
    assert.equal(call.url, resultUrl);
    assert.equal(call.options.method, "GET");
    assert.equal(call.options.body, undefined);
    assert.equal(call.options.headers, undefined);
    assert.equal(call.options.redirect, "error");
  }
});

test("拒絕非 Google 結果網址，服務錯誤不洩漏 HTML 或結果票證", async () => {
  for (const location of [
    "https://example.com/result",
    "http://script.googleusercontent.com/result",
    "https://user:password@script.googleusercontent.com/result",
  ]) {
    let calls = 0;
    await assert.rejects(
      workerClient(env, async () => {
        calls++;
        return new Response(null, { status: 302, headers: { location } });
      })("claim"),
      /轉址不正確/,
    );
    assert.equal(calls, 1);
  }
  await assert.rejects(
    workerClient(
      env,
      async () => new Response("<html>private-response</html>"),
      async () => {},
    )("claim"),
    (error) => {
      assert.match(error.message, /未回傳可確認的結果/);
      assert.doesNotMatch(error.message, /private-response|user_content_key/);
      return true;
    },
  );
  let calls = 0;
  await assert.rejects(
    workerClient(env, async () => {
      calls++;
      return Response.json({ ok: false, error: { message: "工作租約已失效" } });
    })("stored"),
    /工作租約已失效/,
  );
  assert.equal(calls, 1);
});

test("一次性結果持續失效或 POST 回應中斷時，最多三次重送相同 nonce 與簽章", async () => {
  const writes = [];
  let reads = 0;
  const client = workerClient(
    env,
    async (url, options) => {
      if (options.method === "POST") {
        writes.push(options.body);
        if (writes.length === 1) throw new Error("模擬已執行但回應中斷");
        return new Response(null, { status: 302, headers: { location: resultUrl } });
      }
      reads++;
      return writes.length === 2
        ? new Response("gone", { status: 404 })
        : Response.json({ ok: true, data: { leaseId: "same-lease" } });
    },
    async () => {},
  );
  assert.deepEqual(await client("claim", { owner: "1:1" }), { leaseId: "same-lease" });
  assert.equal(writes.length, 3);
  assert.equal(new Set(writes).size, 1);
  assert.equal(reads, 4);
});
