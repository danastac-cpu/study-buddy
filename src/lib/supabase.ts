import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

console.log('Supabase Initializing... URL length:', supabaseUrl?.length || 0);
console.log('Environment variables loaded:', !!supabaseUrl && !!supabaseAnonKey);

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
