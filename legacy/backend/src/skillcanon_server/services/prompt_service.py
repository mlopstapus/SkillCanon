import re
import uuid

from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from sqlalchemy import String, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.skillcanon_server.models import Prompt, PromptShare, PromptVersion, User
from src.skillcanon_server.schemas import (
    ExpandRequest,
    ExpandResponse,
    NewVersionCreate,
    PolicyResponse,
    PromptCreate,
    PromptListResponse,
    PromptResponse,
    PromptVersionResponse,
    ShareResponse,
)


def _prompt_response(prompt: Prompt) -> PromptResponse:
    latest = prompt.versions[0] if prompt.versions else None
    return PromptResponse(
        id=prompt.id,
        name=prompt.name,
        description=prompt.description,
        is_deprecated=prompt.is_deprecated,
        user_id=prompt.user_id,
        created_at=prompt.created_at,
        updated_at=prompt.updated_at,
        latest_version=PromptVersionResponse.model_validate(latest) if latest else None,
    )


async def create_prompt(db: AsyncSession, data: PromptCreate) -> PromptResponse:
    prompt = Prompt(name=data.name, description=data.description, user_id=data.user_id)
    db.add(prompt)
    await db.flush()

    version = PromptVersion(
        prompt_id=prompt.id,
        version=data.version.version,
        system_template=data.version.system_template,
        user_template=data.version.user_template,
        input_schema=data.version.input_schema,
        tags=data.version.tags,
    )
    db.add(version)
    await db.commit()

    result = await db.execute(
        select(Prompt).where(Prompt.id == prompt.id).options(selectinload(Prompt.versions))
    )
    prompt = result.scalar_one()
    return _prompt_response(prompt)


async def list_prompts(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20,
    tag: str | None = None,
    user_id: uuid.UUID | None = None,
) -> PromptListResponse:
    query = select(Prompt).options(selectinload(Prompt.versions))
    count_query = select(func.count()).select_from(Prompt)

    if user_id:
        shared_ids = select(PromptShare.prompt_id).where(PromptShare.user_id == user_id)
        ownership_filter = or_(Prompt.user_id == user_id, Prompt.id.in_(shared_ids))
        query = query.where(ownership_filter)
        count_query = count_query.where(ownership_filter)

    if tag:
        query = query.join(Prompt.versions).where(
            PromptVersion.tags.cast(String).contains(tag)
        )
        count_query = (
            select(func.count(Prompt.id.distinct()))
            .select_from(Prompt)
            .join(Prompt.versions)
            .where(PromptVersion.tags.cast(String).contains(tag))
        )
        if user_id:
            shared_ids = select(PromptShare.prompt_id).where(PromptShare.user_id == user_id)
            ownership_filter = or_(Prompt.user_id == user_id, Prompt.id.in_(shared_ids))
            count_query = count_query.where(ownership_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    query = query.offset((page - 1) * page_size).limit(page_size).order_by(Prompt.name)
    result = await db.execute(query)
    prompts = result.scalars().unique().all()

    return PromptListResponse(
        items=[_prompt_response(p) for p in prompts],
        total=total,
        page=page,
        page_size=page_size,
    )


async def get_prompt(db: AsyncSession, name: str) -> PromptResponse | None:
    result = await db.execute(
        select(Prompt).where(Prompt.name == name).options(selectinload(Prompt.versions))
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        return None
    return _prompt_response(prompt)


async def get_prompt_versions(db: AsyncSession, name: str) -> list[PromptVersionResponse] | None:
    result = await db.execute(
        select(Prompt).where(Prompt.name == name).options(selectinload(Prompt.versions))
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        return None
    return [PromptVersionResponse.model_validate(v) for v in prompt.versions]


async def create_version(
    db: AsyncSession, name: str, data: NewVersionCreate
) -> PromptVersionResponse | None:
    result = await db.execute(select(Prompt).where(Prompt.name == name))
    prompt = result.scalar_one_or_none()
    if not prompt:
        return None

    version = PromptVersion(
        prompt_id=prompt.id,
        version=data.version,
        system_template=data.system_template,
        user_template=data.user_template,
        input_schema=data.input_schema,
        tags=data.tags,
    )
    db.add(version)
    await db.commit()
    await db.refresh(version)
    return PromptVersionResponse.model_validate(version)


async def deprecate_prompt(db: AsyncSession, name: str) -> bool:
    result = await db.execute(select(Prompt).where(Prompt.name == name))
    prompt = result.scalar_one_or_none()
    if not prompt:
        return False
    prompt.is_deprecated = True
    await db.commit()
    return True


MAX_INCLUDE_DEPTH = 3


async def pin_version(
    db: AsyncSession, name: str, version: str
) -> PromptResponse | None:
    result = await db.execute(
        select(Prompt).where(Prompt.name == name).options(selectinload(Prompt.versions))
    )
    prompt = result.scalar_one_or_none()
    if not prompt:
        return None
    target = next((v for v in prompt.versions if v.version == version), None)
    if not target:
        return None
    prompt.active_version_id = target.id
    await db.commit()
    await db.refresh(prompt)
    return _prompt_response(prompt)


async def _fetch_prompt_version(
    db: AsyncSession, name: str, version: str | None = None
) -> PromptVersion | None:
    query = select(Prompt).where(Prompt.name == name).options(selectinload(Prompt.versions))
    result = await db.execute(query)
    prompt = result.scalar_one_or_none()
    if not prompt or not prompt.versions or prompt.is_deprecated:
        return None
    if version:
        return next((v for v in prompt.versions if v.version == version), None)
    if prompt.active_version_id:
        pinned = next((v for v in prompt.versions if v.id == prompt.active_version_id), None)
        if pinned:
            return pinned
    return prompt.versions[0]


def _render_template(
    env: SandboxedEnvironment, template_str: str, variables: dict
) -> str:
    return env.from_string(template_str).render(**variables)


def _build_include_prompt(
    prompt_cache: dict[str, PromptVersion],
    env: SandboxedEnvironment,
    variables: dict,
    depth: int,
) -> callable:
    def include_prompt(name: str) -> str:
        if depth >= MAX_INCLUDE_DEPTH:
            return f"[include_prompt('{name}'): max depth ({MAX_INCLUDE_DEPTH}) exceeded]"
        pv = prompt_cache.get(name)
        if not pv:
            return f"[include_prompt('{name}'): prompt not found]"

        inner_env = SandboxedEnvironment(undefined=StrictUndefined)
        inner_include = _build_include_prompt(prompt_cache, inner_env, variables, depth + 1)
        inner_env.globals["include_prompt"] = inner_include

        parts = []
        if pv.system_template:
            parts.append(_render_template(inner_env, pv.system_template, variables))
        user_tpl = pv.user_template or "{{ input }}"
        parts.append(_render_template(inner_env, user_tpl, variables))
        return "\n\n".join(parts)

    return include_prompt


async def _prefetch_included_prompts(
    db: AsyncSession, template_str: str | None
) -> set[str]:
    if not template_str:
        return set()
    return set(re.findall(r"include_prompt\(['\"]([a-z0-9-]+)['\"]\)", template_str))


def _apply_policies(
    system_template: str | None,
    user_template: str,
    policies: list[PolicyResponse],
    template_vars: dict,
) -> tuple[str | None, str, list[str]]:
    """Apply policy enforcement to templates. Returns (system, user, applied_names)."""
    applied: list[str] = []
    inject_parts: list[str] = []

    for p in policies:
        if not p.is_active:
            continue
        applied.append(p.name)
        if p.enforcement_type.value == "prepend" and system_template is not None:
            system_template = p.content + "\n\n" + system_template
        elif p.enforcement_type.value == "prepend" and system_template is None:
            system_template = p.content
        elif p.enforcement_type.value == "append":
            user_template = user_template + "\n\n" + p.content
        elif p.enforcement_type.value == "inject":
            inject_parts.append(p.content)
        # validate is handled post-render (not modifying templates)

    if inject_parts:
        template_vars["policies"] = "\n".join(inject_parts)

    return system_template, user_template, applied


async def expand_prompt(
    db: AsyncSession,
    name: str,
    data: ExpandRequest,
    version: str | None = None,
    user_id: uuid.UUID | None = None,
) -> ExpandResponse | None:
    pv = await _fetch_prompt_version(db, name, version)
    if not pv:
        return None

    # Resolve policies and objectives if user context is available
    applied_policy_names: list[str] = []
    objective_titles: list[str] = []
    effective_user_id = user_id

    # If no explicit user_id, try to get it from the prompt's owner
    if not effective_user_id:
        prompt_result = await db.execute(
            select(Prompt).where(Prompt.name == name)
        )
        prompt_obj = prompt_result.scalar_one_or_none()
        if prompt_obj:
            effective_user_id = prompt_obj.user_id

    system_tpl = pv.system_template
    user_tpl = pv.user_template or "{{ input }}"
    template_vars = dict(data.input)

    if effective_user_id:
        from src.skillcanon_server.services import objective_service, policy_service

        all_policies = await policy_service.resolve_all_policies(
            db, effective_user_id, data.project_id
        )
        system_tpl, user_tpl, applied_policy_names = _apply_policies(
            system_tpl, user_tpl, all_policies, template_vars
        )
        objective_titles = await objective_service.resolve_all_objectives(
            db, effective_user_id, data.project_id
        )
        if objective_titles:
            template_vars["objectives"] = "\n".join(objective_titles)

    referenced_names: set[str] = set()
    referenced_names |= await _prefetch_included_prompts(db, system_tpl)
    referenced_names |= await _prefetch_included_prompts(db, user_tpl)

    prompt_cache: dict[str, PromptVersion] = {}
    fetch_queue = list(referenced_names)
    seen = set()
    for _ in range(MAX_INCLUDE_DEPTH):
        next_queue: list[str] = []
        for ref_name in fetch_queue:
            if ref_name in seen:
                continue
            seen.add(ref_name)
            ref_pv = await _fetch_prompt_version(db, ref_name)
            if ref_pv:
                prompt_cache[ref_name] = ref_pv
                next_queue += list(
                    await _prefetch_included_prompts(db, ref_pv.system_template)
                    | await _prefetch_included_prompts(db, ref_pv.user_template)
                )
        fetch_queue = next_queue
        if not fetch_queue:
            break

    env = SandboxedEnvironment(undefined=StrictUndefined)
    include_fn = _build_include_prompt(prompt_cache, env, template_vars, depth=0)
    env.globals["include_prompt"] = include_fn

    system_message = None
    if system_tpl:
        system_message = _render_template(env, system_tpl, template_vars)

    user_message = _render_template(env, user_tpl, template_vars)

    return ExpandResponse(
        prompt_name=name,
        prompt_version=pv.version,
        system_message=system_message,
        user_message=user_message,
        applied_policies=applied_policy_names,
        objectives=objective_titles,
    )


async def get_all_prompt_names(db: AsyncSession) -> list[str]:
    result = await db.execute(
        select(Prompt.name).where(Prompt.is_deprecated.is_(False)).order_by(Prompt.name)
    )
    return list(result.scalars().all())


async def share_prompt(
    db: AsyncSession, name: str, target_user_id: uuid.UUID
) -> ShareResponse | None:
    prompt = (await db.execute(select(Prompt).where(Prompt.name == name))).scalar_one_or_none()
    if not prompt:
        return None
    existing = (
        await db.execute(
            select(PromptShare).where(
                PromptShare.prompt_id == prompt.id, PromptShare.user_id == target_user_id
            )
        )
    ).scalar_one_or_none()
    if existing:
        user = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one()
        return ShareResponse(
            id=existing.id,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            created_at=existing.created_at,
        )
    share = PromptShare(prompt_id=prompt.id, user_id=target_user_id)
    db.add(share)
    await db.commit()
    await db.refresh(share)
    user = (await db.execute(select(User).where(User.id == target_user_id))).scalar_one()
    return ShareResponse(
        id=share.id,
        user_id=user.id,
        username=user.username,
        display_name=user.display_name,
        created_at=share.created_at,
    )


async def unshare_prompt(
    db: AsyncSession, name: str, target_user_id: uuid.UUID
) -> bool:
    prompt = (await db.execute(select(Prompt).where(Prompt.name == name))).scalar_one_or_none()
    if not prompt:
        return False
    share = (
        await db.execute(
            select(PromptShare).where(
                PromptShare.prompt_id == prompt.id, PromptShare.user_id == target_user_id
            )
        )
    ).scalar_one_or_none()
    if not share:
        return False
    await db.delete(share)
    await db.commit()
    return True


async def list_prompt_shares(db: AsyncSession, name: str) -> list[ShareResponse] | None:
    prompt = (await db.execute(select(Prompt).where(Prompt.name == name))).scalar_one_or_none()
    if not prompt:
        return None
    result = await db.execute(
        select(PromptShare, User)
        .join(User, PromptShare.user_id == User.id)
        .where(PromptShare.prompt_id == prompt.id)
        .order_by(PromptShare.created_at)
    )
    return [
        ShareResponse(
            id=share.id,
            user_id=user.id,
            username=user.username,
            display_name=user.display_name,
            created_at=share.created_at,
        )
        for share, user in result.all()
    ]
