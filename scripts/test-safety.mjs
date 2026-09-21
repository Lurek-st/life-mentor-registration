export async function localTestURL(expectedMode = "preview") {
  const value = process.env.TEST_URL,
    space = process.env.TEST_DATA_SPACE;
  if (!value || !space?.startsWith("test-"))
    throw Error("Use npm test: an isolated local test server is required.");
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error("Tests may only target a loopback HTTP origin.");
  const response = await fetch(new URL("/api/sessions", url));
  const state = await response.json();
  if (!response.ok || state.mode !== expectedMode || state.dataSpace !== space)
    throw Error("Test database identity mismatch; no mutations allowed.");
  return url.origin;
}
