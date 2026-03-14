# คู่มือตั้งค่า Webhook และแก้ปัญหา "ไม่มีข้อความเข้ามา"

## สาเหตุที่พบบ่อย

### 1. ตั้งค่า Webhook ในที่ผิด

**สำคัญ:** ต้องตั้งค่าใน **LINE Developers Console** ([developers.line.biz/console](https://developers.line.biz/console/))  
**ไม่ใช่** LINE Official Account Manager (manager.line.biz)

- LINE Official Account Manager = จัดการแชทด้วยมือ
- LINE Developers Console = ตั้งค่า Messaging API และ Webhook

### 2. ไม่ได้เปิด "Use webhook"

ใน LINE Developers Console → Channel ของคุณ → **Messaging API** tab:

1. ไปที่ **Webhook settings**
2. ใส่ **Webhook URL**: `https://YOUR-WORKER-URL/webhook` (เช่น `https://line-oa-worker.arlott0418.workers.dev/webhook`)
3. **เปิด "Use webhook"** (ต้องเป็นสีเขียว/เปิด)
4. กด **Verify** เพื่อทดสอบว่า LINE ส่ง request ถึง Worker ได้

### 3. Channel ID และ Bot User ID

LINE ส่ง `destination` ใน webhook (มักเป็น Bot User ID รูปแบบ `Uxxxxxxxx`)  
**ระบบจะดึง Bot User ID อัตโนมัติ** เมื่อ Add Channel — แค่ใส่ Channel ID (2009440045) + Access Token

- **Channel ID** ไม่สามารถแก้ไขได้หลังสร้าง
- ถ้า channel เดิมยังใช้ Channel ID อยู่ ให้ลบแล้ว Add ใหม่ (ระบบจะดึง Bot User ID ให้)

### 4. Channel Secret ไม่ตรงกัน

ถ้า **Channel Secret** ใน Settings ไม่ตรงกับใน LINE Developers Console (Basic settings tab):

- การตรวจสอบลายเซ็นจะล้มเหลว
- Worker จะตอบ 401 และ LINE อาจหยุดส่ง webhook

**แก้ไข:** อัปเดต Channel Secret ใน Settings ให้ตรงกับ LINE Developers Console (และกด Issue ใหม่ถ้าจำเป็น)

### 5. Auto-response messages

ถ้าเห็นข้อความอัตโนมัติ เช่น "this account isn't set up to reply directly to messages":

- แสดงว่า LINE กำลังใช้โหมดตอบอัตโนมัติ
- Webhook ยังควรได้รับ event อยู่ ถ้า "Use webhook" เปิดอยู่
- ถ้าไม่มีข้อความเข้ามาใน Dashboard เลย ให้ตรวจสอบข้อ 1–4 ก่อน

---

## ใส่ Webhook URL แล้วแต่ข้อความยังไม่เข้า

### ขั้นตอนตรวจสอบ

1. **ตรวจสอบว่า Worker ทำงาน**
   - เปิด `https://YOUR-WORKER-URL/health` ในเบราว์เซอร์ (หรือ `/webhook/health`)
   - ควรเห็น `ok: true` และรายการ channels ที่มีใน Settings
   - **ถ้าได้ 404:** แปลว่า Worker ยังไม่ได้ deploy เวอร์ชันล่าสุด → รัน `npm run build:worker` แล้ว deploy ใหม่ (wrangler deploy หรือ copy dist/worker.js ไป Cloudflare Dashboard)
   - ตรวจว่า Channel ID ในรายการตรงกับ Channel ID จาก LINE (2009440045)

2. **ตั้งค่าใน LINE Developers Console (ไม่ใช่แค่ LINE Official Account Manager)**
   - ไปที่ [developers.line.biz/console](https://developers.line.biz/console/)
   - เลือก Provider → Channel ของคุณ
   - แท็บ **Messaging API** → Webhook settings
   - ใส่ Webhook URL ให้ตรงกับ Worker (เช่น `https://line-oa-worker.arlott0410.workers.dev/webhook`)
   - **เปิด "Use webhook"** (สวิตช์ต้องเป็นสีเขียว)
   - กด **Verify** — ถ้าสำเร็จ แสดงว่า LINE ส่ง request ถึง Worker ได้

3. **ตรวจสอบ Channel ID และ Channel Secret ใน Settings**
   - Channel ID ต้องเป็น `2009440045` (จาก Basic settings)
   - Channel Secret ต้องตรงกับใน LINE Developers Console → Basic settings ทุกตัว

4. **ดูสถิติ Webhook ใน LINE Developers Console**
   - Messaging API → Webhook → ดูจำนวน Success / Failed
   - ถ้า Failed สูง อาจเป็นเพราะ Worker ตอบ 401 (Channel Secret ไม่ตรง) หรือ 500 (error อื่น)

---

## Checklist การตั้งค่า

- [ ] ตั้งค่า Webhook ใน **LINE Developers Console** (developers.line.biz)
- [ ] ใส่ Webhook URL ให้ตรงกับ Worker (รวม https และ /webhook)
- [ ] เปิด **Use webhook**
- [ ] กด **Verify** แล้วได้ผลสำเร็จ (ไม่ error)
- [ ] Channel ID ใน Settings ตรงกับ `destination` ที่ LINE ส่ง (จาก Basic settings)
- [ ] Channel Secret และ Access Token ใน Settings ตรงกับใน LINE Developers Console

---

## สถิติและข้อผิดพลาดของ Webhook

ใน LINE Developers Console → Channel → **Messaging API** tab:

- ดู **Webhook** → ตรวจสอบสถิติและข้อผิดพลาด
- ถ้ามี error มาก แสดงว่า LINE ส่ง webhook ถึง Worker แต่ Worker ตอบกลับไม่ถูกต้อง (เช่น 401, 500)

---

## การแก้ไขที่ทำในโค้ด

1. **GET /webhook** – รองรับการตรวจสอบ URL จาก LINE
2. **POST filter** – แก้ `in.(uuid1,uuid2)` ให้ใช้ UUID ถูกต้องสำหรับ admin_status และ admin_skills
3. **timestamp** – ใช้ `event.timestamp` จาก LINE เพื่อบันทึกเวลาข้อความให้ถูกต้อง
4. **Lookup fallback** – ค้นหา channel จากทั้ง `bot_user_id` และ `line_channel_id` (รัน migration `20260316000000_add_line_channel_id.sql`)
5. **Logging** – เมื่อ channel ไม่พบหรือ signature ไม่ถูกต้อง จะ log ใน Cloudflare Workers → Logs

## ตรวจสอบ destination ที่ LINE ส่ง

1. กด **Verify** ใน LINE Developers Console → Messaging API → Webhook
2. เปิด Cloudflare Dashboard → Workers → line-oa-worker → **Logs** (Real-time)
3. ดู log `[webhook] Verify/test request, destination: xxx` — ค่านี้ต้องตรงกับ Channel ID ใน Settings
