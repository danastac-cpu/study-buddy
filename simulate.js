const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const env = fs.readFileSync(".env.local", "utf8");
const supabaseUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1];
const supabaseKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function runTest() {
  console.log("Creating user A...");
  const { data: userA, error: errA } = await supabase.auth.signUp({
    email: `testA_${Date.now()}@example.com`,
    password: 'password123'
  });
  if (errA) return console.log("Signup A Error:", errA);
  
  console.log("Creating user B...");
  const { data: userB, error: errB } = await supabase.auth.signUp({
    email: `testB_${Date.now()}@example.com`,
    password: 'password123'
  });
  if (errB) return console.log("Signup B Error:", errB);

  const uidA = userA.user.id;
  const uidB = userB.user.id;
  console.log("User A:", uidA, "User B:", uidB);

  // Login as User A
  await supabase.auth.signInWithPassword({ email: userA.user.email, password: 'password123' });

  // User A creates Help Request
  console.log("User A inserting help request...");
  const { data: req, error: reqErr } = await supabase.from('help_requests').insert([{
    requester_id: uidA,
    course_name: 'Test Course',
    status: 'open',
    urgency_level: 'today',
    date_str: 'TBD'
  }]).select().single();
  
  if (reqErr) {
    console.log("Insert Request Error:", reqErr);
    return;
  }
  
  const reqId = req.id;
  console.log("Help Request Created:", reqId);

  // Login as User B
  await supabase.auth.signInWithPassword({ email: userB.user.email, password: 'password123' });

  // User B offers help
  console.log("User B offering help...");
  const { data: updateRes, error: updateErr } = await supabase.from('help_requests')
    .update({ status: 'pending', helper_id: uidB, helper_revealed: true })
    .eq('id', reqId)
    .select();
    
  if (updateErr) {
    console.log("Offer Help Update Error (RLS?):", updateErr);
  } else {
    console.log("Offer Help Update Success! Data:", updateRes);
  }

  // User B inserts update for User A
  console.log("User B inserting notification for User A...");
  const { error: notifErr } = await supabase.from('updates').insert([{
     user_id: uidA,
     type: 'help',
     request_id: reqId,
     title_he: 'Test'
  }]);
  if (notifErr) console.log("Insert Notification Error:", notifErr);
  else console.log("Notification inserted successfully.");

  // Login as User A
  await supabase.auth.signInWithPassword({ email: userA.user.email, password: 'password123' });

  // User A approves reveal
  console.log("User A approving reveal...");
  const { error: appErr } = await supabase.from('help_requests').update({
    status: 'active',
    requester_revealed: true
  }).eq('id', reqId);
  
  if (appErr) console.log("Approve Reveal Error:", appErr);
  else console.log("Approve Reveal Success!");
}

runTest();
