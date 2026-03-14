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
      setError("Name and Channel ID are required");
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
        <label className="block text-sm font-medium text-gray-700">Channel Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
          placeholder="My Line OA"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Channel ID</label>
        <input
          type="text"
          value={botUserId}
          onChange={(e) => setBotUserId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-gray-600 font-mono text-sm placeholder-gray-400"
          placeholder="2009440045"
          disabled={!!channel}
        />
        <p className="mt-1 text-xs text-gray-500">
          จาก LINE Developers Console → Basic settings (ตัวเลข Channel ID)
        </p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Channel Access Token {channel && "(leave blank to keep existing)"}
        </label>
        <input
          type="password"
          value={accessToken}
          onChange={(e) => setAccessToken(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
          placeholder="••••••••"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Channel Secret {channel && "(leave blank to keep existing)"}
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-[#06C755] focus:outline-none focus:ring-2 focus:ring-[#06C755]/20"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[#06C755] px-4 py-2 text-sm font-medium text-white hover:bg-[#05b04a] disabled:opacity-50"
        >
          {loading ? "Saving..." : channel ? "Update" : "Add Channel"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
