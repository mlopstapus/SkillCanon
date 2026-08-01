"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignSkillToProjectAction, unassignSkillFromProjectAction } from "../../prompts/actions";
import {
  addCollaboratorTeamAction,
  addProjectMemberAction,
  addProjectRepoAction,
  removeCollaboratorTeamAction,
  removeProjectMemberAction,
  removeProjectRepoAction,
} from "../actions";
import { AddMemberDrawer } from "./add-member-drawer";
import { AddRepoDrawer } from "./add-repo-drawer";
import { AddTeamDrawer } from "./add-team-drawer";
import { ProjectDetailView, type ProjectDetailData, type ProjectDetailTab } from "./project-detail-view";

export interface ProjectDetailProps {
  data: ProjectDetailData;
}

/**
 * Thin client wrapper owning router context, active tab, and every drawer's
 * open/closed state — kept separate from the pure `ProjectDetailView` per
 * this repo's View/wrapper split convention.
 */
export function ProjectDetail({ data }: ProjectDetailProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("prompts");
  const [addTeamOpen, setAddTeamOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addRepoOpen, setAddRepoOpen] = useState(false);

  return (
    <>
      <ProjectDetailView
        data={data}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onRemoveMember={async (userId) => {
          await removeProjectMemberAction(data.id, userId);
          router.refresh();
        }}
        onRemoveTeam={async (teamId) => {
          await removeCollaboratorTeamAction(data.id, teamId);
          router.refresh();
        }}
        onRemoveRepo={async (repoId) => {
          await removeProjectRepoAction(data.id, repoId);
          router.refresh();
        }}
        onSetRequirement={async (skillId, requirement) => {
          if (requirement) {
            await assignSkillToProjectAction(data.id, skillId, requirement);
          } else {
            await unassignSkillFromProjectAction(data.id, skillId);
          }
          router.refresh();
        }}
        onOpenAddTeam={() => setAddTeamOpen(true)}
        onOpenAddMember={() => setAddMemberOpen(true)}
        onOpenAddRepo={() => setAddRepoOpen(true)}
      />
      {addTeamOpen ? (
        <AddTeamDrawer
          addableTeams={data.addableTeams}
          onClose={() => setAddTeamOpen(false)}
          onAdd={async (teamId) => {
            await addCollaboratorTeamAction(data.id, teamId);
            setAddTeamOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {addMemberOpen ? (
        <AddMemberDrawer
          addableUsers={data.addableUsers}
          onClose={() => setAddMemberOpen(false)}
          onAdd={async (userId) => {
            await addProjectMemberAction(data.id, userId);
            setAddMemberOpen(false);
            router.refresh();
          }}
        />
      ) : null}
      {addRepoOpen ? (
        <AddRepoDrawer
          onClose={() => setAddRepoOpen(false)}
          onSubmit={async (values) => {
            const result = await addProjectRepoAction(data.id, values);
            if (result.ok) {
              setAddRepoOpen(false);
              router.refresh();
            }
            return result;
          }}
        />
      ) : null}
    </>
  );
}
