"""Lightweight SQLite column adds for evolving schema without Alembic."""

from sqlalchemy import inspect, text

from app.database import engine


INVESTMENT_COLUMNS = {
    "source": "VARCHAR(50) DEFAULT 'manual'",
    "external_id": "VARCHAR(100)",
    "isin": "VARCHAR(32)",
    "exchange": "VARCHAR(20)",
    "last_synced_at": "DATETIME",
}

RECURRING_PLAN_COLUMNS = {
    "excluded_due_dates": "TEXT",
    "source": "VARCHAR(50) DEFAULT 'manual'",
    "external_id": "VARCHAR(100)",
}

ASSET_COLUMNS = {
    "purity_karat": "FLOAT DEFAULT 24",
}

NET_WORTH_GOAL_COLUMNS = {
    "expected_annual_return": "FLOAT DEFAULT 0.12",
}


def ensure_schema() -> None:
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if "investments" in tables:
        existing = {col["name"] for col in inspector.get_columns("investments")}
        with engine.begin() as conn:
            for name, ddl in INVESTMENT_COLUMNS.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE investments ADD COLUMN {name} {ddl}"))
    if "recurring_plans" in tables:
        existing = {col["name"] for col in inspector.get_columns("recurring_plans")}
        with engine.begin() as conn:
            for name, ddl in RECURRING_PLAN_COLUMNS.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE recurring_plans ADD COLUMN {name} {ddl}"))
    if "assets" in tables:
        existing = {col["name"] for col in inspector.get_columns("assets")}
        with engine.begin() as conn:
            for name, ddl in ASSET_COLUMNS.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE assets ADD COLUMN {name} {ddl}"))
    if "net_worth_goals" in tables:
        existing = {col["name"] for col in inspector.get_columns("net_worth_goals")}
        with engine.begin() as conn:
            for name, ddl in NET_WORTH_GOAL_COLUMNS.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE net_worth_goals ADD COLUMN {name} {ddl}"))
