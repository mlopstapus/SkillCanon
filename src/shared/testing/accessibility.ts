import type { AxeResults, ContextSpec, Result } from "axe-core";
import { Window } from "happy-dom";

const AXE_TAGS = ["wcag2a", "wcag2aa", "best-practice"];

function setGlobal(name: string, value: unknown): unknown {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = globals[name];
  globals[name] = value;
  return previous;
}

export async function findCriticalOrSeriousAxeViolations(markup: string): Promise<Result[]> {
  const window = new Window({ url: "http://localhost/" });
  window.document.documentElement.lang = "en";
  window.document.title = "SkillCanon accessibility audit";
  window.document.body.innerHTML = markup;

  const previous = {
    window: setGlobal("window", window),
    document: setGlobal("document", window.document),
    Node: setGlobal("Node", window.Node),
    Element: setGlobal("Element", window.Element),
    HTMLElement: setGlobal("HTMLElement", window.HTMLElement),
    Document: setGlobal("Document", window.Document),
  };

  try {
    const { default: axeCore } = await import("axe-core");
    const context = window.document.documentElement as unknown as ContextSpec;
    const results = (await axeCore.run(context, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: AXE_TAGS },
    })) as AxeResults;

    return results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
  } finally {
    setGlobal("window", previous.window);
    setGlobal("document", previous.document);
    setGlobal("Node", previous.Node);
    setGlobal("Element", previous.Element);
    setGlobal("HTMLElement", previous.HTMLElement);
    setGlobal("Document", previous.Document);
  }
}

export async function expectNoCriticalOrSeriousAxeViolations(markup: string): Promise<void> {
  const violations = await findCriticalOrSeriousAxeViolations(markup);
  if (violations.length > 0) {
    throw new Error(
      violations
        .map((violation) => `${violation.id} (${violation.impact}): ${violation.description}`)
        .join("\n"),
    );
  }
}
