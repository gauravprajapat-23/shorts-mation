import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Sparkles, Rocket, Folder, Settings, Youtube, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/templates", label: "Templates", icon: Sparkles },
  { to: "/campaigns", label: "Campaigns", icon: Rocket },
  { to: "/assets", label: "Assets", icon: Folder },
  { to: "/youtube-connect", label: "YouTube", icon: Youtube },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children, title, action }: { children: ReactNode; title?: string; action?: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex h-screen w-full bg-canvas text-foreground">
      {/* Left icon rail */}
      <nav className="w-16 shrink-0 border-r border-border bg-panel flex flex-col items-center py-5 gap-6">
        <Link to="/dashboard" className="size-10 rounded-xl bg-brand grid place-items-center shadow-lg shadow-brand/30">
          <div className="size-4 bg-white rotate-45" />
        </Link>
        <div className="flex flex-col gap-2 flex-1">
          {nav.map((n) => {
            const active = pathname === n.to || (n.to !== "/dashboard" && pathname.startsWith(n.to));
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "size-10 rounded-lg grid place-items-center transition-colors",
                  active
                    ? "bg-brand/10 text-brand border border-brand/20"
                    : "text-zinc-500 hover:text-white hover:bg-white/5",
                )}
                title={n.label}
              >
                <Icon className="size-4" />
              </Link>
            );
          })}
        </div>
        <button
          onClick={handleSignOut}
          className="size-10 rounded-lg grid place-items-center text-zinc-500 hover:text-white hover:bg-white/5"
          title="Sign out"
        >
          <LogOut className="size-4" />
        </button>
      </nav>

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {title !== undefined && (
          <header className="h-14 shrink-0 border-b border-border px-6 flex items-center justify-between bg-panel/50 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold tracking-tight text-zinc-500 uppercase">ShortsForge /</span>
              <span className="text-sm font-semibold">{title}</span>
            </div>
            <div className="flex items-center gap-3">{action}</div>
          </header>
        )}
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}