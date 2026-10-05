# @theia-shell/theia-llm-chat

## What it is

A Theia extension for chatting with an LLM: the LLM service of the httpeers
mesh this browser has joined (the hub's `llm` module, LiteLLM behind it), or
any OpenAI-compatible endpoint. Replies stream in and are rendered as
Markdown. Conversations are kept in the browser.

## Why it exists

The mesh's hub offers an LLM service to its members. This extension is the
app's client for it, and works against any OpenAI-compatible API too, so the
same view serves a member with no mesh. Its core (the OpenAI client, the
chat controller, the stores, the discovery of the mesh's service) has no DOM
and no Theia in it, so it is tested on its own.

## How to use

A private package of this workspace, not published. Add it to an app's
dependencies as `"@theia-shell/theia-llm-chat": "workspace:^"`, next to
`theia-httpeers` and `theia-markdown`. Theia loads it through its
`theiaExtensions` entry: `frontendOnly` → `lib/browser/chat-frontend-module`.

`main` (`lib/common/index.js`) exports:

- the setup flow: `createChatSetup`, `ChatSetup`, `SetupStage`, `ChatSource`
  (`"mesh" | "custom"`);
- the core: `listModels`, `streamChat`, `sseData`, `describeError`,
  `ChatHttpError`, `ChatNetworkError`, `ChatStreamError`;
  `createChatController`, `endpointClient`; the config helpers and
  `memoryConfigStore`; `idbConfigStore`, `idbSessionStore`; the session types;
- mesh discovery: `findLlmAdvert`, `discoverLlm`, `mintKey`, `meshConfig`,
  `isMeshAdmin`, `DiscoveryError`, `KeyRequestError`.

| Contribution | What |
|---|---|
| View *LLM Chat* (main area) | The conversations, the thread, a composer with *Send*, *Stop* and *Regenerate*, and the endpoint and model pickers |
| Commands | *LLM Chat: New Chat*, *Use the Mesh's LLM*, *Use a Custom Endpoint…*, *Create a Key for a Member…* (an admin mints a key for someone else and copies it), *Toggle LLM Chat* |

Build and test: `pnpm --filter @theia-shell/theia-llm-chat build` and
`pnpm --filter @theia-shell/theia-llm-chat test` (111 unit tests: the OpenAI
client and its SSE parsing, the chat controller, the config and session
stores, discovery, and the setup flow). The e2e tests are in
[`app/tests/mesh.spec.ts`](../../app/tests/mesh.spec.ts) and
[`app/tests/chat.spec.ts`](../../app/tests/chat.spec.ts).

## Examples

The client against any OpenAI-compatible endpoint:

```ts
import { listModels, streamChat } from "@theia-shell/theia-llm-chat";

const config = { baseUrl: "https://api.openai.com/v1", apiKey: "sk-…" };
const models = await listModels(config); // sorted ids from GET {baseUrl}/models
let reply = "";
for await (const delta of streamChat({
  config,
  model: models[0],
  messages: [{ role: "user", content: "Hello" }],
})) {
  reply += delta;
}
```

## Internals

### The mesh's LLM is found through the hub, and only the hub

When the member goes live, the chat looks for the hub's own `llm` advert (any
other peer's is ignored), reads the hub's OpenAPI document at
`/peers/<hub>/llm/openapi.json`, and refuses any URL it names outside
`/peers/<hub>/llm/`:
`The LLM service document's <what> resolves to <url>, outside <mount>; refusing to send the key or open anything there.`
The document also names the key header (`llmKey` security scheme). Other
failures read `Could not reach the LLM service at <url>.`,
`The LLM service document answered HTTP <status>…` or
`The LLM service document has no servers[0].url.`

### A key is checked on the step that asked for it

The service needs a key of its own: paste one, or, as an admin, request one
(`POST …/llm/keys`, valid 30 days). The models are listed with the key before
the chat opens, so a wrong key fails there: `HTTP 401: …` with the hint
`Check the API key.` An unreachable endpoint, or one that does not allow
cross-origin requests, shows
`The endpoint is unreachable, or it does not allow cross-origin requests.` A
502 or 504 from the mesh edge adds `The mesh peer or hub is unreachable (<kind>).`

### Each source keeps its own settings

Conversations are kept in IndexedDB, in the `llm-chat` database. The endpoint,
key and models are kept per source, in the profiles `theia-mesh` and
`theia-custom`, so switching back and forth keeps both.

### Replies are escaped Markdown, then sanitized

A reply is model output, so it is treated as data. It is rendered with `theia-markdown`'s
`renderMarkdown` (markdown-it with `html: false`): raw HTML in a reply is escaped and
`javascript:` links are refused. The resulting HTML then goes through DOMPurify, as in the
Markdown preview, so a gap in either layer alone does not put script on the page.

### Dependencies

`theia-httpeers` (the session and mesh view), `theia-markdown` (the
renderer) and `@theia/core`. The OpenAI client uses plain `fetch` and parses
the SSE stream itself; there is no SDK.

## License

No license is declared: there is no LICENSE file and no `license` field in
`package.json`.
