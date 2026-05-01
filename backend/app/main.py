import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .db import init_db
from .routers import agents_control, graph, space, teachers, topics
from .services.agent_worker import AgentWorker
from .services.cartographer import cartographer
from .services.space_watcher import watcher
from .teachers import TEACHERS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("axiom")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    log.info("DB initialized")

    workers = [AgentWorker(t, watcher) for t in TEACHERS]
    app.state.watcher = watcher
    app.state.workers = workers
    app.state.cartographer = cartographer

    watcher_task = watcher.start()
    worker_tasks = [w.start() for w in workers]
    cartographer_task = cartographer.start()

    log.info(
        "Stigmergic scheduler online: 1 watcher + %d workers + 1 cartographer",
        len(workers),
    )
    try:
        yield
    finally:
        log.info("Shutting down scheduler…")
        await cartographer.stop()
        await watcher.stop()
        for w in workers:
            await w.stop()
        for task in [watcher_task, cartographer_task, *worker_tasks]:
            if not task.done():
                task.cancel()
        await asyncio.gather(
            *worker_tasks, watcher_task, cartographer_task, return_exceptions=True
        )
        log.info("Scheduler stopped")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Axiom API", version="0.3.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(teachers.router)
    app.include_router(space.router)
    app.include_router(agents_control.router)
    app.include_router(topics.router)
    app.include_router(graph.router)

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    return app


app = create_app()
