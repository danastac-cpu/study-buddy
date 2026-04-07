async function introspect() {
  const supabaseUrl = 'https://tlhllqqsmbpxqfufnmgb.supabase.co';
  const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaGxscXFzbWJweHFmdWZubWdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NzQ3NDMsImV4cCI6MjA5MDM1MDc0M30.S0s4IqHIUA68Rr5tTQsX_Yoezk7vsILTRH8OYwUuCDc';

  const query = `
    query {
      __schema {
        types {
          name
          fields {
            name
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(`${supabaseUrl}/graphql/v1`, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });
    
    const json = await res.json();
    if (json.data && json.data.__schema) {
      json.data.__schema.types.forEach(t => {
        if (['study_groups', 'help_requests', 'feed_posts', 'profiles'].includes(t.name.toLowerCase())) {
           console.log(`=== ${t.name} ===`);
           t.fields.forEach(f => console.log('  ' + f.name));
        }
      });
    } else {
      console.log('No schema data:', json);
    }
  } catch(e) {
    console.error(e);
  }
}

introspect();
