# ตั้งค่า Secrets สำหรับ Worker (รันครั้งเดียว)
# ต้อง regenerate keys ใน Supabase ก่อน (เพราะ keys เดิมถูกแชร์แล้ว)
#
# วิธีใช้:
# 1. Supabase Dashboard -> Settings -> API -> Reset/Regenerate keys
# 2. Copy ค่าใหม่
# 3. รันคำสั่งด้านล่าง (แทน YOUR_ANON_KEY และ YOUR_SERVICE_ROLE_KEY ด้วยค่าจริง)

Write-Host "ตั้งค่า Worker Secrets..." -ForegroundColor Cyan
Write-Host "ใส่ค่าจาก Supabase Dashboard -> Settings -> API" -ForegroundColor Yellow
Write-Host ""

$anonKey = Read-Host "SUPABASE_ANON_KEY"
$serviceKey = Read-Host "SUPABASE_SERVICE_ROLE_KEY"

if ($anonKey) {
    $anonKey | npx wrangler secret put SUPABASE_ANON_KEY
}
if ($serviceKey) {
    $serviceKey | npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
}

Write-Host ""
Write-Host "เสร็จแล้ว! รัน 'npm run deploy:workers' เพื่อ deploy Worker" -ForegroundColor Green
