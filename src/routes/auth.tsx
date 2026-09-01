import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — ShortsForge" }] }),
  validateSearch: (s: Record<string, unknown>): { next?: string; message?: string } => {
    const next = typeof s.next === "string" && s.next.startsWith("/") && !s.next.startsWith("//") ? s.next : undefined;
    const message = typeof s.message === "string" ? s.message : undefined;
    return { ...(next ? { next } : {}), ...(message ? { message } : {}) };
  },
  component: AuthPage,
});

function AuthPage() {
  const { next, message } = Route.useSearch();
  const target = next ?? "/dashboard";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(message ?? "");

  useEffect(() => {
    let alive = true;
    // OAuth returns to /auth, not a protected route. This avoids the protected
    // loader racing Supabase while it is still restoring/exchanging the session.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setNotice(error.message);
      if (data.session) window.location.replace(target);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session) {
        window.location.replace(target);
      }
    });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, [target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotice("");
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === "signup") {
        const redirect = new URL("/auth", window.location.origin);
        redirect.searchParams.set("next", target);
        redirect.searchParams.set("message", "Email confirmed. Signing you in…");
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: redirect.toString() },
        });
        if (error) throw error;
        if (data.session) {
          toast.success("Account created");
          window.location.replace(target);
          return;
        }
        // Supabase commonly requires email verification and deliberately returns
        // no session. Do not redirect into the protected app in that state.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setNotice("This email is already registered. Try signing in instead.");
          setMode("signin");
        } else {
          setNotice("Account created. Check your email and confirm the address, then you’ll be signed in.");
          toast.success("Check your email to confirm your account");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) throw error;
        if (!data.session) throw new Error("Sign-in completed without a session. Please try again.");
        window.location.replace(target);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setNotice(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const google = async () => {
    setLoading(true);
    setNotice("");
    try {
      const callback = new URL("/auth", window.location.origin);
      callback.searchParams.set("next", target);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString(), queryParams: { access_type: "offline", prompt: "select_account" } },
      });
      if (error) throw error;
      // On browsers Supabase redirects automatically. Keep this fallback for
      // environments where skipBrowserRedirect-like behavior is injected.
      if (data?.url) window.location.assign(data.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      setNotice(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas grid place-items-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="size-9 rounded-xl bg-brand grid place-items-center shadow-lg shadow-brand/30"><div className="size-3.5 bg-white rotate-45" /></div>
          <span className="font-display text-xl font-bold tracking-tight">ShortsForge</span>
        </div>
        <div className="bg-panel border border-border rounded-2xl p-8">
          <h1 className="font-display text-2xl font-bold tracking-tight mb-1">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-zinc-400 mb-6">{mode === "signin" ? "Sign in to your automation studio." : "Start automating in minutes."}</p>
          {notice ? <div className="mb-4 rounded-lg border border-border bg-zinc-950 px-3 py-2 text-xs text-zinc-300">{notice}</div> : null}
          <button type="button" onClick={google} disabled={loading} className="w-full h-10 rounded-md bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-100 transition-colors mb-4 disabled:opacity-50">Continue with Google</button>
          <div className="flex items-center gap-3 my-4"><div className="h-px flex-1 bg-border" /><span className="text-[10px] uppercase tracking-widest text-zinc-500">or email</span><div className="h-px flex-1 bg-border" /></div>
          <form onSubmit={submit} className="space-y-3">
            <input type="email" autoComplete="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={6} placeholder="Password (min 6 chars)" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full h-10 px-3 rounded-md bg-zinc-950 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
            <button type="submit" disabled={loading} className="w-full h-10 rounded-md bg-brand text-white font-bold text-sm hover:bg-brand/90 disabled:opacity-50">{loading ? "..." : mode === "signin" ? "Sign in" : "Create account"}</button>
          </form>
          <button type="button" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setNotice(""); }} className="w-full mt-4 text-xs text-zinc-500 hover:text-white">{mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}</button>
        </div>
      </div>
    </div>
  );
}
