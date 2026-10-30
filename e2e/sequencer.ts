import { BaseSequencer, type TestSpecification } from "vitest/node";

// ui-walk runs first-run setup, which only works once per database; every
// other e2e file reuses the admin it creates.
export default class E2ESequencer extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const rank = (f: TestSpecification) => (f.moduleId.includes("ui-walk") ? 0 : 1);
    return [...files].sort((a, b) => rank(a) - rank(b));
  }
}
