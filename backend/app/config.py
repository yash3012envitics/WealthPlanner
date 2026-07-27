from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "WealthPlanner"
    secret_key: str = "wealthplanner-dev-secret-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = "sqlite:///./wealthplanner.db"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
    ]
    # Optional global Zerodha Kite Connect defaults (per-user credentials still preferred)
    kite_api_key: str = ""
    kite_api_secret: str = ""
    kite_redirect_url: str = "http://127.0.0.1:5173/investments?kite=callback"
    kite_auto_sync_hours: int = 6
    upload_dir: str = "uploads"
    max_upload_bytes: int = 15 * 1024 * 1024  # 15 MB
    allowed_upload_extensions: list[str] = [
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".csv",
        ".txt",
        ".zip",
    ]
    # Precious metals — Indian market (INR). Optional GoldAPI key improves reliability.
    gold_api_key: str = ""
    metals_auto_refresh_hours: int = 6
    metals_cache_seconds: int = 300


settings = Settings()
