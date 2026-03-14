"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, ChevronDown, ChevronUp, ListTodo, MessageSquare, Inbox } from "lucide-react";

/** คู่มือ workflow สำหรับสตาฟตอบแชท */
export function WorkflowGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-blue-100 bg-blue-50/50 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm font-medium text-blue-800 hover:bg-blue-100/50 transition"
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        <span>วิธีใช้งาน — Workflow ตอบแชท</span>
        {open ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 space-y-3 text-sm text-blue-900">
          <ol className="space-y-2 list-decimal list-inside">
            <li className="flex gap-2">
              <ListTodo className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              <span>
                <strong>รับแชท</strong> — ไปที่{" "}
                <Link href="/queue" className="underline font-medium text-blue-700 hover:text-blue-900">
                  Queue
                </Link>{" "}
                หรือกดปุ่ม <span className="bg-amber-200 px-1 rounded">รับ</span> ในคิวรอรับด้านบน เพื่อรับแชทมาทำงาน
              </span>
            </li>
            <li className="flex gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
              <span>
                <strong>รับไว้แล้ว</strong> — แชทที่รับแล้วจะอยู่ในปุ่ม &quot;รับไว้แล้ว&quot; ใช้ดูแชทที่รับผิดชอบอยู่
              </span>
            </li>
            <li className="flex gap-2">
              <Inbox className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
              <span>
                <strong>ยังไม่อ่าน</strong> — กรองแชทที่ลูกค้าส่งมาล่าสุดและยังไม่ได้เปิดดู เพื่อตอบด่วน
              </span>
            </li>
            <li>
              <strong>เปิดแชท</strong> — เมื่อเปิดแชทจะ mark อ่านอัตโนมัติ แชทจะหายจาก &quot;ยังไม่อ่าน&quot;
            </li>
          </ol>
          <p className="text-xs text-blue-700 pt-1 border-t border-blue-200">
            สถานะ: <span className="text-green-600">ว่าง</span> = พร้อมรับแชท · <span className="text-amber-600">ไม่ว่าง</span> = ยุ่ง · <span className="text-gray-500">ออฟไลน์</span> = ไม่รับแชท
          </p>
        </div>
      )}
    </div>
  );
}
