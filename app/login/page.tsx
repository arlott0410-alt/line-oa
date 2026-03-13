"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.replace("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) throw error;
      setMagicLinkSent(true);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">LineUnifiedInbox</h1>
          <p className="mt-2 text-slate-400">Unified inbox for Line Official Account</p>
        </div>

        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-8 shadow-xl backdrop-blur">
          {magicLinkSent ? (
            <div className="text-center">
              <p className="text-green-400">Check your email for the magic link!</p>
              <button
                onClick={() => {
                  setMagicLinkSent(false);
                  setMode("password");
                }}
                className="mt-4 text-sm text-slate-400 hover:text-white"
              >
                Try password login instead
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6 flex gap-2">
                <button
                  onClick={() => setMode("password")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    mode === "password"
                      ? "bg-[#06C755] text-white"
                      : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  Password
                </button>
                <button
                  onClick={() => setMode("magic")}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    mode === "magic"
                      ? "bg-[#06C755] text-white"
                      : "bg-slate-700/50 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  Magic Link
                </button>
              </div>

              <form
                onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                    placeholder="admin@example.com"
                  />
                </div>

                {mode === "password" && (
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-slate-300">
                      Password
                    </label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-white placeholder-slate-500 focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                      placeholder="••••••••"
                    />
                  </div>
                )}

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#06C755] py-2.5 font-medium text-white transition hover:bg-[#05b04a] disabled:opacity-50"
                >
                  {loading ? "Please wait..." : mode === "password" ? "Sign In" : "Send Magic Link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          Admin access only. Contact your administrator for credentials.
        </p>
      </div>
    </div>
  );
}
