"""
MCP tool definitions for SkillCanon prompts.

All tools are statically registered:
  - `sh-list`    — list available prompts
  - `sh-search`  — search prompts by name/tag
  - `sh-context` — show effective policies & objectives
  - `sh-run`     — expand any prompt by name
"""

import json
import logging
import uuid as uuid_mod

from mcp.server.fastmcp import Context

from src.skillcanon_server.database import async_session
from src.skillcanon_server.mcp.server import mcp
from src.skillcanon_server.mcp.session import get_current_api_key, session_manager
from src.skillcanon_server.schemas import ExpandRequest
from src.skillcanon_server.services import (
    apikey_service,
    objective_service,
    policy_service,
    prompt_service,
    workflow_service,
)

logger = logging.getLogger("skillcanon.mcp.tools")


async def _resolve_session_user_id(ctx: Context) -> "uuid_mod.UUID | None":
    """Return the user_id for the current MCP session, resolving from API key if needed."""
    session_key = id(ctx.session)
    state = session_manager.get_or_create(session_key)
    if state.user_id:
        logger.debug("Resolved user_id from session cache: %s", state.user_id)
        return state.user_id

    api_key_raw = get_current_api_key()
    if not api_key_raw:
        logger.debug("No API key in context — returning None user_id")
        return None

    logger.debug("Resolving user_id from API key prefix: %s", api_key_raw[:12])
    async with async_session() as db:
        api_key = await apikey_service.validate_key(db, api_key_raw)
        if api_key:
            state.user_id = api_key.user_id
            logger.debug("Resolved user_id: %s", api_key.user_id)
            return api_key.user_id
    logger.warning("API key validation failed for prefix: %s", api_key_raw[:12])
    return None


async def _maybe_inject_session_context(ctx: Context) -> str | None:
    """Resolve user from API key and return context block on first call per session.

    Returns the formatted context string to prepend, or None if context was
    already delivered or no user could be resolved.
    """
    session_key = id(ctx.session)
    state = session_manager.get_or_create(session_key)

    if state.context_delivered:
        return None

    # Resolve user from API key
    api_key_raw = get_current_api_key()
    if not api_key_raw:
        logger.debug("No API key in request — skipping session context injection")
        state.context_delivered = True
        return None

    async with async_session() as db:
        api_key = await apikey_service.validate_key(db, api_key_raw)
        if not api_key:
            logger.warning("Invalid API key — skipping session context injection")
            state.context_delivered = True
            return None

        state.user_id = api_key.user_id

        policies = await policy_service.resolve_effective(db, api_key.user_id)
        objectives = await objective_service.resolve_effective(db, api_key.user_id)

    lines = ["═══ SESSION CONTEXT (auto-injected) ═══", ""]

    # Policies
    lines.append("Policies:")
    all_policies = list(policies.inherited) + list(policies.local)
    if all_policies:
        for p in all_policies:
            scope = "inherited" if p.is_inherited else "local"
            lines.append(f"  - [{p.enforcement_type.value}] {p.name}: {p.content[:120]} ({scope})")
    else:
        lines.append("  (none configured)")

    lines.append("")

    # Objectives
    lines.append("Objectives:")
    all_objectives = list(objectives.inherited) + list(objectives.local)
    if all_objectives:
        for o in all_objectives:
            desc = f" — {o.description[:80]}" if o.description else ""
            lines.append(f"  - {o.title}{desc}")
    else:
        lines.append("  (none configured)")

    lines.append("")
    lines.append("═══════════════════════════════════════")

    state.context_delivered = True
    return "\n".join(lines)


@mcp.tool(name="sh-list")
async def sh_list(ctx: Context) -> str:
    """List all available prompts in the SkillCanon registry."""
    context_block = await _maybe_inject_session_context(ctx)
    user_id = await _resolve_session_user_id(ctx)
    async with async_session() as db:
        listing = await prompt_service.list_prompts(db, page=1, page_size=1000, user_id=user_id)
    if not listing.items:
        result = "No prompts registered yet."
    else:
        lines = ["Available prompts:"]
        for p in listing.items:
            lines.append(f"  - {p.name}")
        result = "\n".join(lines)
    if context_block:
        return context_block + "\n\n" + result
    return result


@mcp.tool(name="sh-search")
async def sh_search(query: str, ctx: Context) -> str:
    """Search prompts by name or tag.

    Args:
        query: Search term to match against prompt names, descriptions, and tags.
    """
    context_block = await _maybe_inject_session_context(ctx)
    user_id = await _resolve_session_user_id(ctx)
    async with async_session() as db:
        listing = await prompt_service.list_prompts(db, page=1, page_size=100, user_id=user_id)

    matches = []
    q = query.lower()
    for p in listing.items:
        name_match = q in p.name.lower()
        desc_match = p.description and q in p.description.lower()
        tag_match = p.latest_version and any(q in t.lower() for t in p.latest_version.tags)
        if name_match or desc_match or tag_match:
            desc = p.description or "No description"
            has_tags = p.latest_version and p.latest_version.tags
            tags = ", ".join(p.latest_version.tags) if has_tags else "none"
            matches.append(f"  - sh-{p.name}: {desc} [tags: {tags}]")

    if not matches:
        result = f"No prompts matching '{query}'."
    else:
        result = f"Prompts matching '{query}':\n" + "\n".join(matches)
    if context_block:
        return context_block + "\n\n" + result
    return result


@mcp.tool(name="sh-context")
async def sh_context(ctx: Context, project_id: str | None = None) -> str:
    """Show effective policies and objectives for the authenticated user.

    Optionally scoped within a project context.

    Args:
        project_id: Optional UUID of the project to layer on top.
    """
    context_block = await _maybe_inject_session_context(ctx)
    uid = await _resolve_session_user_id(ctx)
    if not uid:
        return "Error: could not resolve user from API key. Ensure a valid Bearer token is set."

    pid = None
    if project_id:
        try:
            pid = uuid_mod.UUID(project_id)
        except ValueError:
            return "Error: invalid project_id UUID."

    async with async_session() as db:
        policies = await policy_service.resolve_effective(db, uid, pid)
        objectives = await objective_service.resolve_effective(db, uid, pid)

    lines = ["=== Effective Policies ==="]
    if policies.inherited:
        lines.append("Inherited (immutable):")
        for p in policies.inherited:
            lines.append(f"  - [{p.enforcement_type.value}] {p.name}: {p.content[:80]}")
    if policies.local:
        lines.append("Local (mutable):")
        for p in policies.local:
            lines.append(f"  - [{p.enforcement_type.value}] {p.name}: {p.content[:80]}")
    if not policies.inherited and not policies.local:
        lines.append("  (none)")

    lines.append("\n=== Effective Objectives ===")
    if objectives.inherited:
        lines.append("Inherited (immutable):")
        for o in objectives.inherited:
            lines.append(f"  - {o.title}")
    if objectives.local:
        lines.append("Local (mutable):")
        for o in objectives.local:
            lines.append(f"  - {o.title}")
    if not objectives.inherited and not objectives.local:
        lines.append("  (none)")

    result = "\n".join(lines)
    if context_block:
        return context_block + "\n\n" + result
    return result


@mcp.tool(name="sh-run")
async def sh_run(name: str, input: str, ctx: Context, project: str | None = None) -> str:  # noqa: A002
    """Run a prompt by name. Use sh-list or sh-search to discover available prompts.

    Args:
        name: The prompt name to run (e.g. 'commit', 'plan', 'code-review').
        input: The input text or JSON object to pass to the prompt template.
        project: Optional project UUID to scope policy/objective resolution.
    """
    context_block = await _maybe_inject_session_context(ctx)

    try:
        parsed = json.loads(input)
        if not isinstance(parsed, dict):
            parsed = {"input": input}
    except (json.JSONDecodeError, TypeError):
        parsed = {"input": input}

    project_id = None
    if project:
        try:
            project_id = uuid_mod.UUID(project)
        except ValueError:
            pass

    # Check user access (owned or shared)
    user_id = await _resolve_session_user_id(ctx)
    if user_id:
        async with async_session() as db:
            user_prompts = await prompt_service.list_prompts(
                db, page=1, page_size=1000, user_id=user_id,
            )
        accessible_names = {p.name for p in user_prompts.items}
        if name not in accessible_names:
            return f"Error: prompt '{name}' not found or not shared with you."

    async with async_session() as db:
        result = await prompt_service.expand_prompt(
            db,
            name,
            ExpandRequest(input=parsed, project_id=project_id),
        )
    if not result:
        return f"Error: prompt '{name}' not found."

    parts = []
    if result.system_message:
        parts.append(f"[System]\n{result.system_message}")
    parts.append(f"[User]\n{result.user_message}")
    if result.applied_policies:
        parts.append(f"[Policies Applied]\n{', '.join(result.applied_policies)}")
    tool_result = "\n\n".join(parts)
    if context_block:
        return context_block + "\n\n" + tool_result
    return tool_result


@mcp.tool(name="sh-workflow-list")
async def sh_workflow_list(ctx: Context) -> str:
    """List all workflows accessible to the authenticated user."""
    context_block = await _maybe_inject_session_context(ctx)
    user_id = await _resolve_session_user_id(ctx)
    async with async_session() as db:
        workflows = await workflow_service.list_workflows(db, user_id=user_id)
    if not workflows:
        result = "No workflows found."
    else:
        lines = ["Available workflows:"]
        for wf in workflows:
            step_count = len(wf.steps)
            desc = f" — {wf.description}" if wf.description else ""
            lines.append(f"  - {wf.name} ({step_count} step{'s' if step_count != 1 else ''}){desc}")
        result = "\n".join(lines)
    if context_block:
        return context_block + "\n\n" + result
    return result


@mcp.tool(name="sh-workflow-run")
async def sh_workflow_run(name: str, input: str, ctx: Context) -> str:  # noqa: A002
    """Run a workflow by name. Each step's output is automatically passed to the next step.

    Use sh-workflow-list to discover available workflows.

    Args:
        name: The workflow name (e.g. 'PRD Pipeline').
        input: The input text or JSON object to pass to the first step.
    """
    context_block = await _maybe_inject_session_context(ctx)
    user_id = await _resolve_session_user_id(ctx)

    # Find the workflow by name
    async with async_session() as db:
        workflows = await workflow_service.list_workflows(db, user_id=user_id)

    match = None
    for wf in workflows:
        if wf.name.lower() == name.lower():
            match = wf
            break

    if not match:
        result = f"Error: workflow '{name}' not found."
        if context_block:
            return context_block + "\n\n" + result
        return result

    # Parse input
    try:
        parsed = json.loads(input)
        if not isinstance(parsed, dict):
            parsed = {"input": input}
    except (json.JSONDecodeError, TypeError):
        parsed = {"input": input}

    async with async_session() as db:
        run_result = await workflow_service.run_workflow(db, match.id, parsed)

    if not run_result:
        result = f"Error: failed to run workflow '{name}'."
        if context_block:
            return context_block + "\n\n" + result
        return result

    # Format output
    parts = [f"Workflow: {run_result.workflow_name} ({len(run_result.steps)} steps)"]
    for sr in run_result.steps:
        status_icon = "✓" if sr.status == "success" else "✗"
        parts.append(
            f"\n--- {status_icon} {sr.step_id} ({sr.prompt_name} v{sr.prompt_version}) ---"
        )
        if sr.error:
            parts.append(f"Error: {sr.error}")
        else:
            if sr.system_message:
                parts.append(f"[System]\n{sr.system_message}")
            parts.append(f"[User]\n{sr.user_message}")

    parts.append("\n--- Final Outputs ---")
    parts.append(json.dumps(run_result.outputs, indent=2))

    tool_result = "\n".join(parts)
    if context_block:
        return context_block + "\n\n" + tool_result
    return tool_result
