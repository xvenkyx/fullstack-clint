import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';

const API_BASE = `${import.meta.env.VITE_API_URL}/api`;

const ChatWidget = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: "Hello. I can answer questions about the system data." }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages(p => [...p, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/query`, { query: msg });
      setMessages(p => [...p, { role: 'ai', text: res.data.response }]);
    } catch {
      setMessages(p => [...p, { role: 'ai', text: "Error processing query." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px',
          padding: '10px 20px', borderRadius: '20px',
          background: '#111', color: '#fff', border: 'none', cursor: 'pointer'
        }}
      >
        Chat Support
      </button>
    );
  }

  return (
    <div className="chat-container">
      <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Assistant</span>
        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
      </div>
      <div className="chat-body" ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '1rem', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <div style={{ 
              display: 'inline-block', padding: '8px 12px', borderRadius: '8px',
              background: m.role === 'user' ? '#0070f3' : '#f0f0f0',
              color: m.role === 'user' ? '#fff' : '#000',
              fontSize: '13px'
            }}>
              <ReactMarkdown>{m.text}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && <div style={{ fontSize: '12px', color: '#888' }}>Processing...</div>}
      </div>
      <form className="chat-input" onSubmit={handleSend}>
        <input 
          placeholder="Type a message..." 
          value={input} 
          onChange={e => setInput(e.target.value)}
        />
      </form>
    </div>
  );
};

export default ChatWidget;
