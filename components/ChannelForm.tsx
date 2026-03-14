"use client";

import { useState } from "react";

export interface Channel {
  id: string;
  name: string;
  bot_user_id: string;
  created_at: string;
}

interface ChannelFormProps {
  channel?: Channel | null;
  onSubmit: (data: {
    name: string;
    access_token: string;
    secret: string;
    bot_user_id: string;
  }) => Promise<void>;
  onCancel?: () => void;
}

export function ChannelForm({
  channel,
  onSubmit,
  onCancel,
}: ChannelFormProps) {
  const [name, setName] = useState(channel?.name || "");
  const [accessToken, setAccessToken] = useState("");
  const [secret, setSecret] = useState("");
  const [botUserId, setBotUserId] = useState(channel?.bot_user_id || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim() || !botUserId.trim()) {
      setError("Name and Bot User ID are required");
      return;
    }
    if (!channel && (!accessToken.trim() || !secret.trim())) {
      setError("Access Token and Secret are required for new channels");
      return;
    }
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        access_token: accessToken.trim() || (channel ? "KEEP_EXISTING" : ""),
        secret: secret.trim() || (channel ? "KEEP_EXISTING" : ""),
        bot_user_id: botUserId.trim(),
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-300">Channel Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white"
          placeholder="My Line OA"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">Bot User ID</label>
        <input
          type="text"
          value={botUserId}
          onChange={(e) => setBotUserId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white"
          placeholder="U1234567890abcdef..."
          disabled={!!channel}
        />
        <p className="mt-1 text-xs text-slate-500">
          From Line Developers Console → Messaging API. Used for webhook routing.
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">
          Channel Access Token {channel && "(leave blank to keep existing)"}
        </label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-300">
          Channel Secret {channel && "(leave blank to keep existing)"}
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-white"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#06C755] px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Saving..." : channel ? "Update" : "Add Channel"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-600 px-4 py-2 text-slate-300"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
