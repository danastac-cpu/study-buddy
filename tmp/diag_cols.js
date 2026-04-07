const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: d1, error: e1 } = await supabase.from('profiles').select('degree').limit(1);
  console.log('degree query:', e1 ? 'FAIL ' + e1.message : 'SUCCESS');

  const { data: d2, error: e2 } = await supabase.from('profiles').select('major').limit(1);
  console.log('major query:', e2 ? 'FAIL ' + e2.message : 'SUCCESS');

  const { data: d3, error: e3 } = await supabase.from('feed_posts').select('degree').limit(1);
  console.log('feed_posts degree query:', e3 ? 'FAIL ' + e3.message : 'SUCCESS');

  const { data: d4, error: e4 } = await supabase.from('feed_posts').select('major').limit(1);
  console.log('feed_posts major query:', e4 ? 'FAIL ' + e4.message : 'SUCCESS');
}

check();
