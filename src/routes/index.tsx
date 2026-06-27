import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Rocket, Zap, Calendar, Upload } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ShortsForge — YouTube Bulk Video Automation" },
      { name: "description", content: "Design one template. Upload one CSV. ShortsForge auto-renders, schedules, and uploads hundreds of YouTube Shorts to your channel." },
      { property: "og:title", content: "ShortsForge — YouTube Bulk Video Automation" },
      { property: "og:description", content: "Design once, upload one CSV, automate forever." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-canvas text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-brand grid place-items-center shadow-lg shadow-brand/30">
              <div className="size-3 bg-white rotate-45" />
            </div>
            <span className="font-display font-bold tracking-tight">ShortsForge</span>
          </div>
          <Link to="/auth" className="px-4 py-2 text-sm rounded-md bg-brand text-white font-semibold hover:bg-brand/90">
            Sign in
          </Link>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <span className="inline-block text-[10px] font-bold uppercase tracking-[0.25em] text-brand mb-6">
          YouTube automation, on autopilot
        </span>
        <h1 className="font-display text-5xl md:text-7xl font-extrabold tracking-tight text-balance leading-[1.05]">
          Design <span className="text-brand">once</span>.<br />
          Upload one CSV. Ship 365 Shorts.
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto text-pretty">
          Build reusable video templates, drop in your content as JSON or CSV, and ShortsForge renders,
          schedules, and uploads to your YouTube channel automatically.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Link to="/auth" className="px-6 py-3 rounded-md bg-brand text-white font-bold hover:bg-brand/90 transition-colors">
            Start automating free
          </Link>
          <a href="#how" className="px-6 py-3 rounded-md border border-border text-white hover:bg-white/5">
            See how it works
          </a>
        </div>
      </section>

      <section id="how" className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-4 gap-4">
        {[
          { icon: Zap, title: "Build a template", desc: "Canva-style editor with variables like {{quote}} and {{author}}." },
          { icon: Upload, title: "Upload one file", desc: "JSON or CSV with all your videos, metadata, schedule, and audio." },
          { icon: Calendar, title: "Schedule rules", desc: "X-per-day, skip weekends, or use schedule_at from your file." },
          { icon: Rocket, title: "Auto-publish", desc: "Renders and uploads to YouTube as private, unlisted, or public." },
        ].map((f) => (
          <div key={f.title} className="p-6 rounded-2xl border border-border bg-panel">
            <f.icon className="size-5 text-brand mb-4" />
            <h3 className="font-display font-bold">{f.title}</h3>
            <p className="mt-2 text-sm text-zinc-400">{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
