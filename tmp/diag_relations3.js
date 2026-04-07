const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: d1, error: e1 } = await supabase.from('study_groups').select('*, profiles:profiles!manager_id(*)').limit(1);
  console.log('sg aliasing error:', e1 ? e1.message : 'SUCCESS', d1);
}

check();
