"""Storage layer — MongoDB when reachable, JSON file store otherwise.

The file fallback keeps the whole app runnable on a laptop with zero
infrastructure, which matters for demos; the interface is identical.
"""
import asyncio
import json
import logging
import os
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)

try:
    from motor.motor_asyncio import AsyncIOMotorClient
    MOTOR_AVAILABLE = True
except ImportError:
    MOTOR_AVAILABLE = False

# Fields excluded from list views to keep payloads small.
_HEAVY_FIELDS = ("image_base64", "chat_history", "future_images")


class ScanRepository:
    name = "base"

    async def insert(self, doc: dict) -> None: ...
    async def get(self, scan_id: str) -> Optional[dict]: ...
    async def list(self, category: Optional[str] = None,
                   favorites_only: bool = False, limit: int = 200) -> List[dict]: ...
    async def update(self, scan_id: str, fields: dict) -> bool: ...
    async def delete(self, scan_id: str) -> bool: ...


class MongoScanRepository(ScanRepository):
    name = "mongodb"

    def __init__(self, client, db_name: str):
        self._client = client
        self._col = client[db_name].scans

    async def insert(self, doc: dict) -> None:
        await self._col.insert_one(dict(doc))

    async def get(self, scan_id: str) -> Optional[dict]:
        return await self._col.find_one({"id": scan_id}, {"_id": 0})

    async def list(self, category=None, favorites_only=False, limit=200):
        query: dict = {}
        if category and category != "all":
            query["category"] = category
        if favorites_only:
            query["favorite"] = True
        projection = {"_id": 0, **{f: 0 for f in _HEAVY_FIELDS}}
        cursor = (self._col.find(query, projection)
                  .sort("created_at", -1).limit(limit))
        return await cursor.to_list(limit)

    async def update(self, scan_id: str, fields: dict) -> bool:
        res = await self._col.update_one({"id": scan_id}, {"$set": fields})
        return res.matched_count > 0

    async def delete(self, scan_id: str) -> bool:
        res = await self._col.delete_one({"id": scan_id})
        return res.deleted_count > 0

    def close(self) -> None:
        self._client.close()


class FileScanRepository(ScanRepository):
    name = "json-file"

    def __init__(self, path: Path):
        self._path = path
        self._lock = asyncio.Lock()
        self._docs: List[dict] = []
        if path.exists():
            try:
                self._docs = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                logger.warning("Could not read %s, starting empty", path)

    def _flush(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._docs), encoding="utf-8")
        tmp.replace(self._path)

    async def insert(self, doc: dict) -> None:
        async with self._lock:
            self._docs.append(dict(doc))
            self._flush()

    async def get(self, scan_id: str) -> Optional[dict]:
        async with self._lock:
            for d in self._docs:
                if d.get("id") == scan_id:
                    return dict(d)
        return None

    async def list(self, category=None, favorites_only=False, limit=200):
        async with self._lock:
            docs = list(self._docs)
        if category and category != "all":
            docs = [d for d in docs if d.get("category") == category]
        if favorites_only:
            docs = [d for d in docs if d.get("favorite")]
        docs.sort(key=lambda d: d.get("created_at", ""), reverse=True)
        return [{k: v for k, v in d.items() if k not in _HEAVY_FIELDS}
                for d in docs[:limit]]

    async def update(self, scan_id: str, fields: dict) -> bool:
        async with self._lock:
            for d in self._docs:
                if d.get("id") == scan_id:
                    d.update(fields)
                    self._flush()
                    return True
        return False

    async def delete(self, scan_id: str) -> bool:
        async with self._lock:
            before = len(self._docs)
            self._docs = [d for d in self._docs if d.get("id") != scan_id]
            if len(self._docs) != before:
                self._flush()
                return True
        return False

    def close(self) -> None:
        pass


async def create_repository() -> ScanRepository:
    mongo_url = os.environ.get("MONGO_URL", "")
    db_name = os.environ.get("DB_NAME", "omniscan")
    if MOTOR_AVAILABLE and mongo_url:
        try:
            client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=2000)
            await client.admin.command("ping")
            logger.info("Storage: MongoDB (%s)", db_name)
            return MongoScanRepository(client, db_name)
        except Exception as e:
            logger.warning("MongoDB unreachable (%s); using JSON file store", e)
    path = Path(__file__).resolve().parent.parent / "data" / "scans.json"
    logger.info("Storage: JSON file store at %s", path)
    return FileScanRepository(path)
