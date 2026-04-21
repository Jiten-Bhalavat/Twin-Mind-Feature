from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.ws import router as ws_router

app = FastAPI(title="TwinMind Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}
