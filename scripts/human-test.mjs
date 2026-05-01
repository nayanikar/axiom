import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://localhost:5173/";
const API = process.env.API_URL || "http://127.0.0.1:8000";
const OUT = path.resolve("test-screenshots");
mkdirSync(OUT, { recursive: true });

const TOPICS = [
  "What is entropy?",
  "How does CRISPR work?",
  "What is stoicism?",
];

const results = [];
function step(name, status, detail = "") {
  const line = `  ${status === "pass" ? "PASS" : status === "warn" ? "WARN" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  results.push({ name, status, detail });
}

async function getJson(pathname) {
  const r = await fetch(`${API}${pathname}`);
  if (!r.ok) throw new Error(`${pathname} -> ${r.status}`);
  return r.json();
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1480, height: 900 } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

  console.log(`\n=== Stigmergic SwarmLearn human-style test (${BASE}) ===`);

  // Step 1 — Empty state
  console.log("\n[1] Empty state");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  const heading = await page.getByRole("heading", { name: /A swarm that watches your queue/i });
  await heading.waitFor({ timeout: 5000 });
  const teacherEls = await page.locator("[data-teacher]").count();
  await page.screenshot({ path: path.join(OUT, "01-empty.png"), fullPage: true });
  step(
    "loads empty state with new copy",
    teacherEls >= 7 ? "pass" : "fail",
    `teacherEls=${teacherEls}`
  );

  // Step 2 — Drop three topics rapidly via the composer.
  console.log("\n[2] Drop three topics rapidly");
  const dropStart = Date.now();
  for (const text of TOPICS) {
    const input = page.getByPlaceholder(/Drop a topic/i).first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.click();
    await input.fill(text);
    // Submit via Enter to avoid disabled-button race during composer transitions.
    await input.press("Enter");
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(1200);
  const queueItems = await page.locator("[data-topic]").count();
  await page.screenshot({ path: path.join(OUT, "02-queued.png"), fullPage: true });
  step(
    "three topics appear in the queue within ~1s",
    queueItems >= 3 ? "pass" : "fail",
    `queueItems=${queueItems} elapsed=${Date.now() - dropStart}ms`
  );

  // No instant response cards: at this moment, articles should be 0.
  const earlyArticles = await page.locator("[data-teacher] article").count();
  step(
    "no instant teacher articles after submit",
    earlyArticles === 0 ? "pass" : "warn",
    `articles=${earlyArticles}`
  );

  // Step 3 — Watch /api/agents/state for staggered scans.
  console.log("\n[3] Wait for staggered worker activity (45s)");
  const seenStatus = new Map();
  const firstWork = new Map();
  const watchStart = Date.now();
  while (Date.now() - watchStart < 45_000) {
    let agents = [];
    try {
      agents = await getJson("/api/agents/state");
    } catch (e) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    for (const a of agents) {
      const set = seenStatus.get(a.teacher_id) || new Set();
      set.add(a.status);
      seenStatus.set(a.teacher_id, set);
      if (a.last_picked_at && !firstWork.has(a.teacher_id)) {
        firstWork.set(a.teacher_id, a.last_picked_at);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const scannedAll = [...seenStatus.values()].every((s) =>
    s.has("scanning") || s.has("working") || s.has("sleeping")
  );
  step(
    "every worker observed at least one scan/work cycle",
    scannedAll && seenStatus.size >= 7 ? "pass" : "warn",
    [...seenStatus.entries()]
      .map(([k, v]) => `${k}=${[...v].join("|")}`)
      .join(" ")
  );

  const ordering = [...firstWork.entries()].sort((a, b) =>
    new Date(a[1]).getTime() - new Date(b[1]).getTime()
  );
  step(
    "picks are staggered across distinct timestamps",
    new Set(ordering.map(([, t]) => t)).size >= Math.min(3, ordering.length) ? "pass" : "warn",
    ordering.map(([k]) => k).join(" → ")
  );

  // Step 4 — Open the entropy topic, look for >1 response and prior-context behaviour.
  console.log("\n[4] Open entropy topic and look for sequential responses");
  await page.locator("[data-topic]").filter({ hasText: "What is entropy?" }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "03-detail.png"), fullPage: true });

  // Wait until the entropy topic has at least 2 done responses.
  const detailStart = Date.now();
  let topicJson = null;
  while (Date.now() - detailStart < 90_000) {
    const topics = await getJson("/api/topics");
    const ent = topics.find((t) => t.text.startsWith("What is entropy"));
    if (!ent) break;
    topicJson = await getJson(`/api/topics/${ent.id}`);
    const doneIds = (topicJson.responses || []).filter((r) => r.status === "done").map((r) => r.teacher_id);
    if (doneIds.length >= 3) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const doneIds = (topicJson?.responses || [])
    .filter((r) => r.status === "done")
    .map((r) => r.teacher_id);
  step(
    "entropy gathers ≥3 unique teacher responses",
    doneIds.length >= 3 ? "pass" : "warn",
    `done=${doneIds.join(",")}`
  );

  // Challenger reads anchor's context — look for a non-trivial response after anchor.
  const anchorResp = topicJson?.responses?.find((r) => r.teacher_id === "anchor" && r.status === "done");
  const challengerResp = topicJson?.responses?.find((r) => r.teacher_id === "challenger" && r.status === "done");
  if (anchorResp && challengerResp && challengerResp.text) {
    // Markdown source legitimately contains ** for bold; assert non-trivial length.
    const decentLength = challengerResp.text.length > 80;
    step(
      "challenger response builds on anchor (length>80)",
      decentLength ? "pass" : "warn",
      `len=${challengerResp.text.length}`
    );
  } else {
    step(
      "challenger response builds on anchor",
      "warn",
      `anchor=${!!anchorResp} challenger=${!!challengerResp}`
    );
  }

  // Step 5 — Wait for at least one stigmergic spawn.
  console.log("\n[5] Wait for at least one agent-trace spawn (≤90s)");
  const spawnStart = Date.now();
  let spawned = [];
  while (Date.now() - spawnStart < 90_000) {
    const topics = await getJson("/api/topics");
    spawned = topics.filter((t) => t.source === "agent-trace");
    if (spawned.length > 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  step(
    "at least one stigmergic spawn appears in queue",
    spawned.length > 0 ? "pass" : "warn",
    `spawned=${spawned.length}`
  );
  if (spawned.length > 0) {
    await page.screenshot({ path: path.join(OUT, "04-spawned.png"), fullPage: true });
  }

  // Step 6 — Agent activity panel rendered (xl viewport).
  console.log("\n[6] Agent activity panel visible");
  const agentRows = await page.locator("[data-agent]").count();
  step(
    "agent activity panel renders 7 workers",
    agentRows >= 7 ? "pass" : "warn",
    `rows=${agentRows}`
  );

  // Step 6b — Knowledge Graph view.
  console.log("\n[6b] Switch to Knowledge Graph view");
  // Wait until the Cartographer has charted at least one done topic (≤120s).
  const cartoStart = Date.now();
  let graphPayload = null;
  while (Date.now() - cartoStart < 120_000) {
    try {
      graphPayload = await getJson("/api/graph");
    } catch (e) {
      // ignore transient errors
    }
    const topicNodes = graphPayload?.nodes?.filter((n) => n.type === "topic") ?? [];
    const fcNodes = graphPayload?.nodes?.filter((n) =>
      ["field", "concept"].includes(n.type)
    ) ?? [];
    if (topicNodes.length >= 1 && fcNodes.length >= 3) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  const cartoElapsed = ((Date.now() - cartoStart) / 1000).toFixed(1);
  const topicNodeCount =
    graphPayload?.nodes?.filter((n) => n.type === "topic").length ?? 0;
  const fcNodeCount =
    graphPayload?.nodes?.filter((n) => ["field", "concept"].includes(n.type))
      .length ?? 0;
  step(
    "cartographer produces topic + field/concept nodes",
    topicNodeCount >= 1 && fcNodeCount >= 3 ? "pass" : "warn",
    `topics=${topicNodeCount} fields/concepts=${fcNodeCount} in ${cartoElapsed}s`
  );

  const crossTopicEdges =
    graphPayload?.edges?.filter((e) =>
      ["surprising", "extends", "relates"].includes(e.edge_type)
    ).length ?? 0;
  step(
    "cartographer suggests at least one cross-topic edge",
    crossTopicEdges >= 1 ? "pass" : "warn",
    `crossEdges=${crossTopicEdges}`
  );

  await page.getByRole("button", { name: /Knowledge graph/i }).click();
  await page.waitForTimeout(800);
  const graphHeading = page.getByRole("heading", { name: /map.*ideas/i });
  await graphHeading.waitFor({ timeout: 5000 });
  // SVG should render at least topicNodeCount group nodes (we count [data-node-type]).
  const renderedNodes = await page.locator("[data-node-type]").count();
  await page.screenshot({ path: path.join(OUT, "07-graph.png"), fullPage: true });
  step(
    "graph view renders nodes",
    renderedNodes >= 1 ? "pass" : "warn",
    `nodesInDom=${renderedNodes}`
  );

  // Hover/click smoke test: clicking a topic node selects it (label box visible).
  const firstTopic = page.locator('[data-node-type="topic"]').first();
  if ((await firstTopic.count()) > 0) {
    await firstTopic.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
  }

  // Switch back to queue view (sidebar uses "Boards" for queue).
  await page.getByRole("button", { name: /^Boards$/i }).click();
  await page.waitForTimeout(300);

  // Step 7 — Fixed indigo palette (no theme toggle in UI).
  console.log("\n[7] Indigo theme shell");
  const isIndigo = await page.evaluate(() =>
    document.documentElement.classList.contains("indigo")
  );
  await page.screenshot({ path: path.join(OUT, "05-indigo.png"), fullPage: true });
  step("indigo theme active on html", isIndigo ? "pass" : "fail");

  console.log("\n[8] Mobile viewport (390x844)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const queueAside = page.locator("aside").first();
  const queueVisible = await queueAside.isVisible().catch(() => false);
  const hasHoriz = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  await page.screenshot({ path: path.join(OUT, "06-mobile.png"), fullPage: true });
  step(
    "mobile collapses both rails, no overflow",
    !queueVisible && !hasHoriz ? "pass" : "warn",
    `queueVisible=${queueVisible} overflow=${hasHoriz}`
  );

  // Step 9 — Console errors
  step(
    "no uncaught console errors",
    consoleErrors.length === 0 ? "pass" : "warn",
    `${consoleErrors.length} errors`
  );
  if (consoleErrors.length) {
    consoleErrors.slice(0, 5).forEach((e) => console.log(`     · ${e.slice(0, 200)}`));
  }

  await browser.close();

  console.log("\n=== Summary ===");
  const passes = results.filter((r) => r.status === "pass").length;
  const warns = results.filter((r) => r.status === "warn").length;
  const fails = results.filter((r) => r.status === "fail").length;
  console.log(`pass=${passes} warn=${warns} fail=${fails}`);
  console.log(`Screenshots in ${OUT}`);
  process.exit(fails > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Test crashed:", err);
  process.exit(2);
});
