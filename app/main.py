import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI
from pydantic import BaseModel

DB_PATH = os.getenv("DB_PATH", "/data/checklist.db")

app = FastAPI()


# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Migrations
#
# Each entry is (name, migration) where migration is either a SQL string or
# a callable(db). run_migrations() applies each one exactly once, recording
# it in the _migrations table. Adding new schema changes means appending a
# new entry — existing entries are never modified.
# ---------------------------------------------------------------------------

MIGRATIONS = [
    ("001_create_checked_items", """
        CREATE TABLE IF NOT EXISTS checked_items (
            id         TEXT PRIMARY KEY,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """),
]


def run_migrations():
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS _migrations (
                name       TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        db.commit()

        applied = {r[0] for r in db.execute("SELECT name FROM _migrations").fetchall()}

        for name, migration in MIGRATIONS:
            if name in applied:
                continue
            try:
                if callable(migration):
                    migration(db)
                else:
                    db.execute(migration)
                db.execute("INSERT INTO _migrations (name) VALUES (?)", (name,))
                db.commit()
            except Exception as exc:
                db.rollback()
                raise RuntimeError(f"Migration '{name}' failed: {exc}") from exc


@app.on_event("startup")
def startup():
    run_migrations()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class ItemIn(BaseModel):
    id: str


# ---------------------------------------------------------------------------
# Items
#
# An "item" is a checked transaction row, keyed by the row ID the userscripts
# already compute client-side (e.g. `bac:row:${pathname}:...`,
# `bn:row:${pathname}:...`). Row presence = checked; there's no separate
# "checked" flag. The scripts add a row when its checkbox is ticked and
# delete it when unticked, so this table only ever holds currently-checked
# rows.
# ---------------------------------------------------------------------------

@app.get("/api/items")
def get_items():
    with get_db() as db:
        rows = db.execute(
            "SELECT id, created_at FROM checked_items ORDER BY created_at"
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/api/items", status_code=201)
def add_item(body: ItemIn):
    with get_db() as db:
        db.execute(
            "INSERT OR IGNORE INTO checked_items (id) VALUES (?)", (body.id,)
        )
        db.commit()
        row = db.execute(
            "SELECT id, created_at FROM checked_items WHERE id = ?", (body.id,)
        ).fetchone()
    return dict(row)


@app.post("/api/items/delete", status_code=204)
def delete_item(body: ItemIn):
    with get_db() as db:
        db.execute("DELETE FROM checked_items WHERE id = ?", (body.id,))
        db.commit()
