"use client"
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function DiagnosePage() {
  const [schema, setSchema] = useState<any>({});

  useEffect(() => {
    async function check() {
      const results: any = {};
      
      const { data: g } = await supabase.from('study_groups').select('*').limit(1);
      results.study_groups = g && g[0] ? Object.keys(g[0]) : 'No rows found';

      const { data: h } = await supabase.from('help_requests').select('*').limit(1);
      results.help_requests = h && h[0] ? Object.keys(h[0]) : 'No rows found';

      const { data: f } = await supabase.from('feed_posts').select('*').limit(1);
      results.feed_posts = f && f[0] ? Object.keys(f[0]) : 'No rows found';

      setSchema(results);
    }
    check();
  }, []);

  return (
    <div style={{ padding: '2rem', fontFamily: 'monospace', background: '#000', color: '#0f0', minHeight: '100vh' }}>
      <h1>🔬 Schema Diagnostic</h1>
      <pre>{JSON.stringify(schema, null, 2)}</pre>
      <hr />
      <p>Instructions: Share this output if possible, or wait for the system to read it.</p>
    </div>
  );
}
