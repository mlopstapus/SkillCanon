// Display only: stored scope values keep their legacy names so existing keys keep working.
const LABELS: Record<string, string> = {
  "prompts:read": "skills:read",
  "prompts:write": "skills:write",
  "workflows:run": "chains:run",
};

export const scopeLabel = (scope: string) => LABELS[scope] ?? scope;
