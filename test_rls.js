const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const supabaseKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: 'test1@example.com', password: 'password123' });
  if (authError) {
     console.log("Auth error:", authError);
     return;
  }
  const { error: insertError } = await supabase.from('group_enrollments').insert([{ group_id: 'test', user_id: auth.user.id, status: 'waiting' }]);
  console.log("Insert Error:", insertError);
}
test();
