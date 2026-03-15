export interface Env {
  /** URL ของ Supabase project (ใน Cloudflare Dashboard ต้องตั้งชื่อตัวแปรว่า SUPABASE_URL) */
  SUPABASE_URL: string;
  /** ถ้าใส่ผิดชื่อเป็น SUPABASE_URI ก็ยังใช้ได้ */
  SUPABASE_URI?: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  R2_PUBLIC_BASE_URL?: string;
  IMAGES_BUCKET?: R2Bucket;
  CACHE_KV?: KVNamespace;
}
