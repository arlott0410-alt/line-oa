"use client";

import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AppSidebar />
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50">{children}</main>
    </div>
  );
}
