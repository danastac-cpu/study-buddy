const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

async function getOpenAPI() {
  const response = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });
  const data = await response.json();
  
  console.log('--- SCHEMA DISCOVERY ---');
  
  if (data.definitions) {
    const list = ['study_groups', 'help_requests', 'feed_posts'];
    list.forEach(table => {
      if (data.definitions[table]) {
        console.log(`${table} columns:`, Object.keys(data.definitions[table].properties));
      } else {
        console.log(`${table} definition not found`);
      }
    });
  } else {
    console.log('No definitions found in OpenAPI spec');
  }
  
  console.log('--- END DISCOVERY ---');
}

getOpenAPI();
