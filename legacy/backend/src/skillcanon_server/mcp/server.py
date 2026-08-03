from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

from src.skillcanon_server.config import settings

_allowed = [h.strip() for h in settings.allowed_hosts.split(",") if h.strip()]
if _allowed:
    _transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=_allowed,
    )
else:
    _transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=False,
    )

mcp = FastMCP(
    "SkillCanon",
    instructions=(
        "SkillCanon is a prompt registry. Use sh-list to see available prompts, "
        "sh-search to find prompts by tag or name, and sh-run to expand "
        "a specific prompt with your input (e.g. sh-run name='commit' input='...'). "
        "Use sh-workflow-list to see available workflows and sh-workflow-run to "
        "execute a multi-step prompt pipeline by name. "
        "When you authenticate with an API key, your team's policies and "
        "objectives are automatically injected into the first tool response "
        "of each session — no need to fetch them separately."
    ),
    streamable_http_path="/",
    transport_security=_transport_security,
)
