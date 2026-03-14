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

### 3. Channel ID ไม่ตรงกับ destination

LINE ส่ง `destination` ใน webhook body เพื่อระบุว่าเป็น channel ไหน  
ค่า **Channel ID** ใน Settings ต้องตรงกับ `destination` ที่ LINE ส่งมา

**วิธีหา Channel ID ที่ถูกต้อง:**

- ไปที่ LINE Developers Console → Channel → **Basic settings** tab
- ดูที่ **Channel ID** (ตัวเลข เช่น `2009440045`)
- สำหรับ Messaging API ส่วนใหญ่ LINE จะส่ง Channel ID นี้ใน `destination`

ถ้า Channel ID ใน Settings ไม่ตรงกับ `destination` ที่ LINE ส่งมา ระบบจะไม่รู้ว่าเป็น channel ไหน และจะไม่บันทึกข้อความ

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
