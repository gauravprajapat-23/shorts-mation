import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import {
  acceptWorkspaceInvitation,
  createWorkspaceInvitation,
  getWorkspaceOverview,
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "@/lib/workspace.functions";
import { History, Shield, Users, Youtube } from "lucide-react";

export const Route = createFileRoute("/_app/team")({
  head: () => ({ meta: [{ title: "Team & Workspace — ShortsForge" }] }),
  component: TeamPage,
});

function TeamPage() {
  const queryClient = useQueryClient();
  const getWorkspace = useServerFn(getWorkspaceOverview);
  const inviteWorkspaceMember = useServerFn(createWorkspaceInvitation);
  const updateMemberRole = useServerFn(updateWorkspaceMemberRole);
  const removeMember = useServerFn(removeWorkspaceMember);
  const acceptInvitation = useServerFn(acceptWorkspaceInvitation);

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "editor" | "analyst">("editor");
  const [token, setToken] = useState("");

  const workspaceQuery = useQuery({
    queryKey: ["workspace"],
    queryFn: () => getWorkspace({ data: {} }),
  });

  const refreshWorkspace = () =>
    queryClient.invalidateQueries({ queryKey: ["workspace"] });

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteWorkspaceMember({
        data: {
          organizationId: workspaceQuery.data!.organization.id,
          email,
          role: inviteRole,
        },
      }),
    onSuccess: (result) => {
      setToken(result.token);
      setEmail("");
      refreshWorkspace();
    },
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: "admin" | "editor" | "analyst" }) =>
      updateMemberRole({
        data: {
          organizationId: workspaceQuery.data!.organization.id,
          ...input,
        },
      }),
    onSuccess: refreshWorkspace,
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      removeMember({
        data: {
          organizationId: workspaceQuery.data!.organization.id,
          userId,
        },
      }),
    onSuccess: refreshWorkspace,
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptInvitation({ data: { token } }),
    onSuccess: () => {
      setToken("");
      refreshWorkspace();
    },
  });

  if (workspaceQuery.isLoading) {
    return <div className="p-8 text-sm text-zinc-400">Loading workspace…</div>;
  }

  if (workspaceQuery.error || !workspaceQuery.data) {
    return (
      <div className="p-8 text-red-300">
        {workspaceQuery.error instanceof Error
          ? workspaceQuery.error.message
          : "Could not load workspace"}
      </div>
    );
  }

  const data: any = workspaceQuery.data;
  const canAdmin = ["owner", "admin"].includes(data.currentRole);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <PageHeader
        title={data.organization.name}
        description={`Workspace · ${data.currentRole}`}
      />

      <section className="rounded-2xl border border-border bg-panel p-5">
        <div className="font-bold flex gap-2 items-center">
          <Users className="size-4" />
          Members
        </div>
        <div className="mt-4 divide-y divide-border">
          {data.members.map((member: any) => (
            <div key={member.user_id} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">
                  {member.profile?.full_name || member.profile?.email || member.user_id}
                </div>
                <div className="text-xs text-zinc-500">
                  {member.profile?.email || member.user_id}
                </div>
              </div>
              <span className="text-xs uppercase text-zinc-400">{member.role}</span>
              {canAdmin && member.role !== "owner" ? (
                <>
                  <select
                    value={member.role}
                    onChange={(event) =>
                      roleMutation.mutate({
                        userId: member.user_id,
                        role: event.target.value as "admin" | "editor" | "analyst",
                      })
                    }
                    className="bg-black/20 border border-border rounded px-2 py-1 text-xs"
                  >
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="analyst">Analyst</option>
                  </select>
                  <button
                    onClick={() => removeMutation.mutate(member.user_id)}
                    className="text-xs text-red-300"
                  >
                    Remove
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {canAdmin ? (
        <section className="rounded-2xl border border-border bg-panel p-5 space-y-3">
          <div className="font-bold flex gap-2 items-center">
            <Shield className="size-4" />
            Invite teammate
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 rounded-md border border-border bg-black/20 px-3 py-2 text-sm"
              placeholder="teammate@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <select
              className="rounded-md border border-border bg-black/20 px-3 py-2 text-sm"
              value={inviteRole}
              onChange={(event) =>
                setInviteRole(event.target.value as "admin" | "editor" | "analyst")
              }
            >
              <option value="editor">Editor</option>
              <option value="analyst">Analyst</option>
              <option value="admin">Admin</option>
            </select>
            <button
              className="rounded-md bg-brand text-white px-4 py-2 text-sm"
              disabled={!email || inviteMutation.isPending}
              onClick={() => inviteMutation.mutate()}
            >
              Create invite
            </button>
          </div>
          {inviteMutation.data?.token ? (
            <div className="rounded-lg bg-black/20 p-3 text-xs break-all">
              <b>Invitation token:</b> {inviteMutation.data.token}
              <div className="text-zinc-500 mt-1">
                Share this securely. It expires in 7 days and is stored only as a hash.
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-panel p-5 space-y-3">
        <div className="font-bold">Accept invitation</div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-border bg-black/20 px-3 py-2 text-sm"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste invitation token"
          />
          <button
            className="rounded-md border border-border px-4 text-sm"
            disabled={!token || acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            Join
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-5">
        <div className="font-bold flex gap-2 items-center">
          <Youtube className="size-4" />
          Workspace YouTube channels
        </div>
        <div className="mt-3 text-sm space-y-2">
          {data.channels.length ? (
            data.channels.map((channel: any) => (
              <div key={channel.id} className="flex justify-between">
                <span>{channel.channel_title || channel.channel_id}</span>
                <span className={channel.is_connected ? "text-emerald-300" : "text-zinc-500"}>
                  {channel.is_connected ? "Connected" : "Disconnected"}
                </span>
              </div>
            ))
          ) : (
            <div className="text-zinc-500">No channels connected to this workspace.</div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-panel p-5">
        <div className="font-bold flex gap-2 items-center">
          <History className="size-4" />
          Audit log
        </div>
        <div className="mt-3 divide-y divide-border text-xs">
          {data.audit.map((entry: any) => (
            <div
              key={entry.id}
              className="py-2 grid sm:grid-cols-[160px_1fr_180px] gap-2"
            >
              <span className="text-zinc-500">
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span>
                {entry.action} {entry.target_type ? `· ${entry.target_type}` : ""}
              </span>
              <span className="text-zinc-500 truncate">
                {entry.actor_user_id || "system"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
