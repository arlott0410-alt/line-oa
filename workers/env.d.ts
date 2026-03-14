export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  R2_PUBLIC_BASE_URL?: string;
  IMAGES_BUCKET?: R2Bucket;
  CACHE_KV?: KVNamespace;
}
