import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase env vars missing. تأكد من وجود VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY في ملف .env.local'
  );
}

// عميل واحد يُستخدم في كل المشروع (Singleton) — لا تُنشئ createClient في أكثر من مكان
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
