'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ResultsPage() {
  const searchParams = useSearchParams();
  const query = searchParams.get('q');
  const major = searchParams.get('major');
  const university = searchParams.get('university');
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize component
  useEffect(() => {
    setMounted(true);
    
    // Check if dark mode was previously enabled - only on client
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('darkMode') === 'enabled';
      setIsDarkMode(savedDarkMode || false);
    }
  }, []);

  // Effect to handle dark mode changes - only run on client
  useEffect(() => {
    if (!mounted) return;
    
    // Apply dark mode to body
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode, mounted]);

  // Call OpenAI API when component mounts
  useEffect(() => {
    if (!mounted || !query) return;

    const fetchAiResponse = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch('/api/openai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prompt: query }),
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.status}`);
        }

        const data = await response.json();
        setAiResponse(data.response);
      } catch (err) {
        console.error('Error fetching AI response:', err);
        setError('Failed to get AI response. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAiResponse();
  }, [query, mounted]);

  // Only render the component client-side to avoid hydration issues
  if (!mounted) return null;

  return (
    <div className="results-container">
      <Link href="/" className="back-button">
        Back to Search
      </Link>
      
      {major && (
        <div className="major-info">
          <h2>Major: {major}</h2>
          {university && <h3>University: {university}</h3>}
        </div>
      )}
      
      <div className={`search-bubble ${isDarkMode ? 'dark-mode' : ''}`}>
        {loading ? (
          <div className="loading">Generating your schedule...</div>
        ) : error ? (
          <div className="error">{error}</div>
        ) : aiResponse ? (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{aiResponse}</pre>
        ) : (
          <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{query || 'No search query provided'}</pre>
        )}
      </div>
    </div>
  );
}