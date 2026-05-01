import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import EmptyState from "@/components/EmptyState";
import { KnowledgeGraphPage } from "@/components/KnowledgeGraphPage";
import { SpaceBindingDialog } from "@/components/SpaceBindingDialog";
import TopBar from "@/components/TopBar";
import TopicDetail from "@/components/TopicDetail";
import { api, subscribeGlobalEvents } from "@/lib/api";

export default function App() {
  const qc = useQueryClient();
  const [currentId, setCurrentId] = useState(null);
  const [bindingOpen, setBindingOpen] = useState(false);
  const [view, setView] = useState("queue");

  const teachersQuery = useQuery({
    queryKey: ["teachers"],
    queryFn: api.teachers,
    staleTime: Infinity,
  });
  const topicsQuery = useQuery({
    queryKey: ["topics"],
    queryFn: api.listTopics,
    refetchInterval: 30_000,
  });
  const agentsQuery = useQuery({
    queryKey: ["agents-state"],
    queryFn: api.agentsState,
    refetchInterval: 5_000,
  });
  const statusQuery = useQuery({
    queryKey: ["space-status"],
    queryFn: api.spaceStatus,
    refetchInterval: 30_000,
  });
  const topicDetail = useQuery({
    queryKey: ["topic", currentId],
    queryFn: () => api.getTopic(currentId),
    enabled: !!currentId,
    refetchInterval: currentId ? 8_000 : false,
  });
  const graphQuery = useQuery({
    queryKey: ["graph"],
    queryFn: api.graph,
    refetchInterval: view === "graph" ? 10_000 : false,
  });

  const teachers = teachersQuery.data || [];
  const topics = topicsQuery.data || [];
  const agents = agentsQuery.data || [];
  const spaceStatus = statusQuery.data;
  const topic = topicDetail.data;
  const graph = graphQuery.data;

  const createTopic = useMutation({
    mutationFn: (text) => api.createTopic(text),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["topics"] });
      setCurrentId((prev) => prev ?? data.id);
    },
  });

  const pauseAgents = useMutation({
    mutationFn: (paused) => api.setAgentsPaused(paused),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-status"] });
      qc.invalidateQueries({ queryKey: ["agents-state"] });
    },
  });

  useEffect(() => {
    const controller = new AbortController();
    subscribeGlobalEvents({
      signal: controller.signal,
      onEvent(evt) {
        const { type, data } = evt;
        if (
          type === "topic.created" ||
          type === "topic.spawned" ||
          type === "topic.capped"
        ) {
          qc.invalidateQueries({ queryKey: ["topics"] });
          if (data?.topic_id) {
            qc.invalidateQueries({ queryKey: ["topic", data.topic_id] });
          }
          if (data?.parent_topic_id) {
            qc.invalidateQueries({ queryKey: ["topic", data.parent_topic_id] });
          }
          return;
        }
        if (
          type === "topic.claimed" ||
          type === "topic.responding" ||
          type === "topic.responded"
        ) {
          if (data?.topic_id) {
            qc.invalidateQueries({ queryKey: ["topic", data.topic_id] });
          }
          qc.invalidateQueries({ queryKey: ["topics"] });
          return;
        }
        if (type === "graph.updated") {
          qc.invalidateQueries({ queryKey: ["graph"] });
          return;
        }
        if (type === "agents.paused") {
          qc.invalidateQueries({ queryKey: ["space-status"] });
          qc.invalidateQueries({ queryKey: ["agents-state"] });
          return;
        }
        if (type?.startsWith("agent.")) {
          qc.invalidateQueries({ queryKey: ["agents-state"] });
          return;
        }
      },
      onError(err) {
        if (err?.name !== "AbortError") {
          console.warn("SSE error", err);
        }
      },
    });
    return () => controller.abort();
  }, [qc]);

  function handleSubmit(text) {
    createTopic.mutate(text);
  }

  function handleSelectTopicFromGraph(topicId) {
    setCurrentId(topicId);
    setView("queue");
  }

  const topBar = ({ onOpenMobileTrail, onOpenMobileAgents }) => (
    <TopBar
      spaceStatus={spaceStatus}
      onOpenMobileTrail={onOpenMobileTrail}
      onOpenMobileAgents={onOpenMobileAgents}
      agentsPaused={Boolean(spaceStatus?.agents_paused)}
      onAgentsPausedChange={(next) => pauseAgents.mutate(next)}
      pausePending={pauseAgents.isPending}
    />
  );

  return (
    <>
      <a href="#main-content" className="ax-skip">
        Skip to main content
      </a>
      <AppShell
        topics={topics}
        agents={agents}
        currentId={currentId}
        onSelect={(id) => {
          setCurrentId(id);
          setView("queue");
        }}
        onNew={() => setCurrentId(null)}
        onOpenBindingDialog={() => setBindingOpen(true)}
        spaceStatus={spaceStatus}
        topBar={topBar}
        view={view}
        onChangeView={setView}
      >
        {view === "graph" ? (
          <KnowledgeGraphPage
            graph={graph}
            isLoading={graphQuery.isLoading}
            onSelectTopic={handleSelectTopicFromGraph}
          />
        ) : !currentId ? (
          <EmptyState
            teachers={teachers}
            onSubmit={handleSubmit}
            loading={createTopic.isPending}
          />
        ) : (
          <TopicDetail
            topic={topic}
            observatoryUrl={spaceStatus?.observatory_url}
            onSelectChild={setCurrentId}
            onSubmit={handleSubmit}
            composerLoading={createTopic.isPending}
          />
        )}
      </AppShell>

      <SpaceBindingDialog
        open={bindingOpen}
        onOpenChange={setBindingOpen}
        status={spaceStatus}
      />
    </>
  );
}
