const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  console.log('--- DIAGNOSTIC START ---');
  
  const { data: g, error: ge } = await supabase.from('study_groups').select('*').limit(1);
  console.log('study_groups columns:', g && g[0] ? Object.keys(g[0]) : (ge ? 'Error: ' + ge.message : 'Empty Table'));

  const { data: h, error: he } = await supabase.from('help_requests').select('*').limit(1);
  console.log('help_requests columns:', h && h[0] ? Object.keys(h[0]) : (he ? 'Error: ' + he.message : 'Empty Table'));

  const { data: f, error: fe } = await supabase.from('feed_posts').select('*').limit(1);
  console.log('feed_posts columns:', f && f[0] ? Object.keys(f[0]) : (fe ? 'Error: ' + fe.message : 'Empty Table'));

  console.log('--- DIAGNOSTIC END ---');
}

check();
