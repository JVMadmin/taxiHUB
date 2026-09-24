"""
Fase 2 — Infra Postgres dual (no rompe Mongo).

Provee engine async + sessionmaker + Base para modelos SQLAlchemy.
DATABASE_URL se lee de env; por defecto apunta al servicio `postgres`
definido en docker-compose.yml (puerto interno 5432).

Uso:
    from app.db import Base, engine, AsyncSessionLocal, get_session
"""
import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://taxihub:taxihub_secret@localhost:5435/taxihub",
)

# Declarative base para todos los modelos Postgres
class Base(DeclarativeBase):
    pass


# Engine async — echo desactivado (activar con SQL_ECHO=1 si se necesita)
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "0") == "1",
    future=True,
    pool_pre_ping=True,
)

# Session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session():
    """Dependencia FastAPI: yield AsyncSession con commit/rollback automático."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_session():
    """Alias de get_session para compatibilidad."""
    async for s in get_session():
        yield s
