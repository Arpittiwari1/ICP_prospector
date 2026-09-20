from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    search_provider: str = "mock"     # "mock" | "http"
    email_verifier: str = "mock"      # "mock" | "http"
    data_api_base: str = ""
    data_api_key: str = ""
    verify_api_base: str = ""
    verify_api_key: str = ""
    chunk_size: int = 50
    http_batch_size: int = 5
    output_dir: str = "./data"
    allowed_origins: str = "http://localhost:5173,http://localhost:8000,http://localhost:8080,http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

settings = Settings()