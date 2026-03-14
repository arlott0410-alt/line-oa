# การปรับปรุงประสิทธิภาพ (Enterprise)

## สาเหตุ Requests สูง

1. **N+1 Query** – GET /chats และ GET /queue เดิมดึง last message แยกต่อ 1 chat = 1 request
2. **LINE Profile** – ดึง profile ทุกครั้งที่มีข้อความ (แม้มี profile แล้ว)
3. **Polling บ่อย** – Frontend poll ทุก 10–15 วินาที แม้แท็บไม่ active

## การแก้ไขที่ทำ

### 1. Denormalize last_message
- เพิ่ม `last_message_content`, `last_message_timestamp`, `last_message_sender_type` ใน `line_users`
- Trigger อัปเดตเมื่อมี message ใหม่
- **ผล:** GET /chats และ GET /queue ลดจาก N+1 เหลือ 1–2 requests ต่อ call

### 2. LINE Profile – ดึงเฉพาะเมื่อจำเป็น
- ดึง profile เฉพาะเมื่อ `profile_name` ยังไม่มี
- **ผล:** ลดการเรียก LINE API ต่อข้อความจากลูกค้าเดิม

### 3. Polling
- เปลี่ยนจาก 10s/15s เป็น **45 วินาที**
- Poll เฉพาะเมื่อแท็บ **visible** (ไม่ poll เมื่อแท็บถูกซ่อน)
- **ผล:** ลด requests จาก frontend ประมาณ 70–80%

### 4. Realtime
- ใช้ Supabase Realtime สำหรับ messages และ line_users
- ข้อมูลอัปเดตทันทีเมื่อมี event ไม่ต้องพึ่ง polling มาก

## การรัน Migration

```bash
supabase db push
```

หรือรัน `supabase/migrations/20260318000000_last_message_denormalize.sql` ใน Supabase SQL Editor
