const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
  const { data: d1, error: e1 } = await supabase.from('study_groups').select('date').limit(1);
  console.log('sg date:', e1 ? e1.message : 'SUCCESS');

  const { data: d2, error: e2 } = await supabase.from('study_groups').select('date_str').limit(1);
  console.log('sg date_str:', e2 ? e2.message : 'SUCCESS');

  const { data: d3, error: e3 } = await supabase.from('study_groups').select('course').limit(1);
  console.log('sg course:', e3 ? e3.message : 'SUCCESS');

  const { data: d4, error: e4 } = await supabase.from('help_requests').select('description').limit(1);
  console.log('hr description:', e4 ? e4.message : 'SUCCESS');

  const { data: d5, error: e5 } = await supabase.from('help_requests').select('content').limit(1);
  console.log('hr content:', e5 ? e5.message : 'SUCCESS');
}

check();
