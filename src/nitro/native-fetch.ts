/**
 * Native fetch shim used to replace `cross-fetch` in the Cloudflare build.
 *
 * `cross-fetch` (pulled in by `@libsql/client` via `@libsql/isomorphic-fetch`)
 * resolves to a `node-fetch` ponyfill whose `node:http` path crashes on
 * workerd. Aliasing it to this module makes the libsql HTTP client use the
 * runtime's native `fetch`/`Request`/`Headers`, which works on Workers.
 *
 * Mirrors cross-fetch's export shape: default = fetch, plus named fetch and
 * the Web API constructors.
 */
const nativeFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => globalThis.fetch(input, init)

export default nativeFetch
export const fetch = nativeFetch
export const Headers = globalThis.Headers
export const Request = globalThis.Request
export const Response = globalThis.Response
