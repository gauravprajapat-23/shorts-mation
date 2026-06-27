import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Folder, Upload, Music, Image as ImageIcon, Film, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useRef } from "react";

export const Route = createFileRoute("/_app/assets")({
  head: () => ({ meta: [{ title: "Assets — ShortsForge" }] }),
  component: AssetsPage,
});

function detectType(mime: string): "image" | "video" | "audio" | "logo" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "image";
}

function AssetsPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { data } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => (await supabase.from("assets").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("assets").upload(path, file);
      if (upErr) throw upErr;
      const { error } = await supabase.from("assets").insert({
        user_id: u.user.id,
        type: detectType(file.type),
        file_name: file.name,
        file_url: path,
        storage_path: path,
        size: file.size,
        mime_type: file.type,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast.success("Uploaded"); },
    onError: (e) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: async (a: NonNullable<typeof data>[number]) => {
      if (a.storage_path) await supabase.storage.from("assets").remove([a.storage_path]);
      const { error } = await supabase.from("assets").delete().eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assets"] }); toast.success("Deleted"); },
  });

  const ICON = { image: ImageIcon, video: Film, audio: Music, font: Folder, other: Folder } as const;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Assets"
        description="Backgrounds, music, logos. Upload once and reference in templates and CSVs."
        action={
          <>
            <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
            <button onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-white font-semibold text-sm hover:bg-brand/90">
              <Upload className="size-4" /> Upload asset
            </button>
          </>
        }
      />
      {!data || data.length === 0 ? (
        <EmptyState icon={Folder} title="No assets yet" description="Upload backgrounds, music tracks, and logos to use across your templates." />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {data.map((a) => {
            const Icon = ICON[a.type as keyof typeof ICON] ?? Folder;
            return (
              <div key={a.id} className="group rounded-xl border border-border bg-panel p-3">
                <div className="aspect-square rounded-md bg-zinc-950 grid place-items-center mb-2">
                  <Icon className="size-6 text-brand" />
                </div>
                <div className="text-xs font-mono truncate">{a.file_name}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{a.type}</div>
                <button onClick={() => del.mutate(a)} className="mt-2 w-full text-xs text-zinc-500 hover:text-brand inline-flex items-center justify-center gap-1"><Trash2 className="size-3" /> Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}