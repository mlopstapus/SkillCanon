"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "./actions";
import { NewProjectDrawer } from "./new-project-drawer";
import { ProjectsListView, type ProjectListRow } from "./projects-list-view";

export interface ProjectsListProps {
  rows: ProjectListRow[];
  teamOptions: Array<{ id: string; name: string }>;
  userOptions: Array<{ id: string; name: string }>;
}

/**
 * Thin client wrapper owning router context and the New Project drawer's
 * open state — kept separate from `ProjectsListView` per this repo's
 * View/wrapper split convention.
 */
export function ProjectsList({ rows, teamOptions, userOptions }: ProjectsListProps) {
  const router = useRouter();
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  return (
    <>
      <ProjectsListView rows={rows} onNewProject={() => setNewProjectOpen(true)} />
      {newProjectOpen ? (
        <NewProjectDrawer
          teamOptions={teamOptions}
          userOptions={userOptions}
          onClose={() => setNewProjectOpen(false)}
          onSubmit={async (values) => {
            const result = await createProjectAction(values);
            if (result.ok) {
              setNewProjectOpen(false);
              router.refresh();
            }
            return result;
          }}
        />
      ) : null}
    </>
  );
}
