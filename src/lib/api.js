import { fetchEventSource } from "@microsoft/fetch-event-source";

const BASE = "";

async function request(path, init) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!resp.ok) {
    let detail;
    try {
      detail = (await resp.json())?.detail || resp.statusText;
    } catch {
      detail = await resp.text();
    }
    throw new Error(`${resp.status} ${detail || "request failed"}`);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  teachers: () => request("/api/teachers"),
  spaceStatus: () => request("/api/space/status"),
  claimSpace: (claim_url, agent_name) =>
    request("/api/space/claim", {
      method: "POST",
      body: JSON.stringify({ claim_url, agent_name }),
    }),
  listTopics: () => request("/api/topics"),
  getTopic: (id) => request(`/api/topics/${id}`),
  createTopic: (text) =>
    request("/api/topics", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  agentsState: () => request("/api/agents/state"),
  setAgentsPaused: (paused) =>
    request("/api/agents/pause", {
      method: "POST",
      body: JSON.stringify({ paused }),
    }),
  graph: () => request("/api/graph"),
};

export function subscribeGlobalEvents({ onEvent, onError, signal }) {
  return fetchEventSource(`/api/events`, {
    method: "GET",
    signal,
    openWhenHidden: true,
    onmessage(ev) {
      if (!ev.data) return;
      try {
        const parsed = JSON.parse(ev.data);
        onEvent?.(parsed);
      } catch (err) {
        onError?.(err);
      }
    },
    onerror(err) {
      onError?.(err);
      // Never rethrow: that rejects the returned promise and surfaces as an unhandled
      // rejection when the dev proxy returns non-SSE (e.g. API down). Retry periodically
      // so events work again once the backend is up.
      return 15_000;
    },
  });
}
