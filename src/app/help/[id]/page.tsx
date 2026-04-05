"use client"
import Link from 'next/link';

export default function PrivateHelpChatPage({ params }: { params: { id: string } }) {
  return (
    <div className="app-wrapper">
      <nav className="sidebar">
        <Link href="/help" className="btn-secondary" style={{ marginBottom: '2rem' }}>&larr; Help Board</Link>
        <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>1-on-1 Help Session</h2>
        <p style={{ color: 'var(--text-main)', fontWeight: '600' }}>Econ 101: Supply & Demand Curve shifts</p>
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#2e7d32', fontWeight: 'bold' }}>URGENT: Today</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--primary-color)' }}>Duration: 15 Mins</span>
        </div>
        
        <div style={{ marginTop: '2rem', background: 'white', border: '2px solid var(--primary-light)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Requester Identity Revealed 🔓</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary-color)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '1.2rem' }}>D</div>
            <div>
              <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--text-main)' }}>David Cohen</p>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Originally: 🩺 Dr. Quantum</p>
            </div>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.5rem 0' }}>🎓 סיעוד (Nursing)</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>📅 שנה א (1st Year)</p>
        </div>
        
        <div style={{ marginTop: 'auto', background: 'var(--primary-light)', padding: '1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', color: 'var(--text-main)' }}>
          Chat here to coordinate the meeting time and share zoom links.
        </div>
      </nav>
      
      <main className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
        
        {/* Chat Header */}
        <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid rgba(138, 99, 210, 0.1)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(10px)' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Private Chat with David</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>You volunteered to help with this request!</p>
        </div>

        {/* Chat Feed */}
        <div style={{ flex: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          
          <div style={{ alignSelf: 'center', background: 'var(--primary-light)', color: 'var(--primary-color)', padding: '0.5rem 1rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: '600', marginBottom: '1rem' }}>
            Status changed from Open to Closed. Identity Revealed.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: '70%' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem', marginLeft: '0.5rem' }}>David • 11:30 AM</span>
            <div style={{ background: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', borderTopLeftRadius: 0, boxShadow: 'var(--shadow-sm)' }}>
              Hey! Thank you so much for offering to help. My quiz is tomorrow morning. Are you free around 5 PM today for a quick Zoom?
            </div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: '70%', alignSelf: 'flex-end' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem', marginRight: '0.5rem' }}>You • 11:35 AM</span>
            <div style={{ background: 'var(--primary-color)', color: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', borderTopRightRadius: 0, boxShadow: 'var(--shadow-sm)' }}>
              Hey David, happy to help. I'm a third-year Econ major 😊 5 PM works perfectly for me! 
            </div>
          </div>

        </div>

        {/* Chat Input */}
        <div style={{ padding: '2rem', borderTop: '1px solid rgba(138, 99, 210, 0.1)', background: 'var(--background-bg)' }}>
          <form style={{ display: 'flex', gap: '1rem' }} onSubmit={(e) => { e.preventDefault(); }}>
            <input type="text" className="input-field" placeholder="Type a message to coordinate..." style={{ flex: 1 }} />
            <button className="btn-primary" style={{ padding: '0 2rem' }}>Send</button>
          </form>
        </div>
      </main>
    </div>
  );
}
