from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.skillcanon_server.models import Prompt, PromptUsage, PromptVersion


async def record_usage(
    db: AsyncSession,
    prompt_name: str,
    prompt_version: str,
    status_code: int,
    latency_ms: float,
) -> None:
    usage = PromptUsage(
        prompt_name=prompt_name,
        prompt_version=prompt_version,
        status_code=status_code,
        latency_ms=latency_ms,
    )
    db.add(usage)
    await db.commit()


async def get_dashboard_stats(db: AsyncSession) -> dict:
    """Return aggregate stats for the metrics dashboard."""
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    # Total prompts
    total_prompts_r = await db.execute(select(func.count()).select_from(Prompt))
    total_prompts = total_prompts_r.scalar_one()

    # Total versions
    total_versions_r = await db.execute(select(func.count()).select_from(PromptVersion))
    total_versions = total_versions_r.scalar_one()

    # Total expand calls
    total_expands_r = await db.execute(select(func.count()).select_from(PromptUsage))
    total_expands = total_expands_r.scalar_one()

    # Expands last 24h
    expands_24h_r = await db.execute(
        select(func.count()).select_from(PromptUsage).where(PromptUsage.created_at >= last_24h)
    )
    expands_24h = expands_24h_r.scalar_one()

    # Avg latency (all time)
    avg_latency_r = await db.execute(
        select(func.avg(PromptUsage.latency_ms)).select_from(PromptUsage)
    )
    avg_latency = round(avg_latency_r.scalar_one() or 0, 1)

    # Error rate (non-200 / total)
    error_count_r = await db.execute(
        select(func.count()).select_from(PromptUsage).where(PromptUsage.status_code != 200)
    )
    error_count = error_count_r.scalar_one()
    error_rate = round((error_count / total_expands * 100) if total_expands > 0 else 0, 1)

    # Top prompts by usage (last 7 days)
    top_prompts_r = await db.execute(
        select(
            PromptUsage.prompt_name,
            func.count().label("count"),
            func.avg(PromptUsage.latency_ms).label("avg_latency"),
        )
        .where(PromptUsage.created_at >= last_7d)
        .group_by(PromptUsage.prompt_name)
        .order_by(func.count().desc())
        .limit(10)
    )
    top_prompts = [
        {
            "name": row.prompt_name,
            "count": row.count,
            "avg_latency_ms": round(row.avg_latency, 1),
        }
        for row in top_prompts_r
    ]

    # Daily usage for last 7 days
    daily_usage_r = await db.execute(
        select(
            func.date(PromptUsage.created_at).label("day"),
            func.count().label("count"),
        )
        .where(PromptUsage.created_at >= last_7d)
        .group_by(func.date(PromptUsage.created_at))
        .order_by(text("day"))
    )
    daily_usage = [
        {"date": str(row.day), "count": row.count}
        for row in daily_usage_r
    ]

    return {
        "total_prompts": total_prompts,
        "total_versions": total_versions,
        "total_expands": total_expands,
        "expands_24h": expands_24h,
        "avg_latency_ms": avg_latency,
        "error_rate_pct": error_rate,
        "top_prompts": top_prompts,
        "daily_usage": daily_usage,
    }
