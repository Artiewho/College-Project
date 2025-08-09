'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { FaSearch, FaLink, FaArrowLeft, FaArrowRight, FaBug, FaEye, FaEyeSlash } from 'react-icons/fa';

interface Citation {
  title: string;
  url: string;
  startIndex: number;
  endIndex: number;
}

interface SemesterData {
  title: string;
  content: string;
}

interface DebugData {
  professorData?: any;
  scrapingLogs?: string[];
  rawData?: any;
  timestamp?: string;
}

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
  const [usedWebSearch, setUsedWebSearch] = useState(false);
  const [citations, setCitations] = useState<Citation[]>([]);
  
  // New state for semester pagination
  const [semesters, setSemesters] = useState<SemesterData[]>([]);
  const [currentSemesterIndex, setCurrentSemesterIndex] = useState(0);
  const [isProcessed, setIsProcessed] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const isDragging = useRef(false);

  // Debug data state
  const [debugData, setDebugData] = useState<DebugData>({});
  const [showDebugData, setShowDebugData] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);

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
      if (!query || !mounted) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch('/api/openai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: query,
            major: major,
            university: university 
          }),
        });
    
        if (!response.ok) {
          // Try to get more detailed error information
          try {
            const errorData = await response.json();
            throw new Error(`Error ${response.status}: ${errorData.error || response.statusText}`);
          } catch (jsonError) {
            throw new Error(`Error ${response.status}: ${response.statusText}`);
          }
        }
    
        const data = await response.json();
        
        if (!data.response) {
          throw new Error('Received empty response from server');
        }
        
        setAiResponse(data.response);
    
        // Check if web search was used
        if (data.usedWebSearch) {
          setUsedWebSearch(true);
        }
        
        // Set citations if available
        if (data.citations && data.citations.length > 0) {
          setCitations(data.citations);
        }

        // Store debug data if available
        if (data.debugData) {
          setDebugData(data.debugData);
        }
        
        // Process the response to extract semesters
        processSemesters(data.response);
      } catch (err) {
        console.error('Error fetching AI response:', err);
        setError(`Failed to get AI response: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setLoading(false);
      }
    };

    fetchAiResponse();
  }, [query, mounted]);

  // Function to fetch debug data from scraper
  const fetchDebugData = async () => {
    if (!query || !university) return;
    
    setDebugLoading(true);
    
    try {
      const response = await fetch('/api/debug-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: query,
          university: university,
          courses: extractCoursesFromQuery(query)
        }),
      });

      if (!response.ok) {
        throw new Error(`Debug fetch failed: ${response.status}`);
      }

      const data = await response.json();
      setDebugData(data);
      
    } catch (err) {
      console.error('Error fetching debug data:', err);
      setDebugData({
        scrapingLogs: [`Error fetching debug data: ${err instanceof Error ? err.message : 'Unknown error'}`],
        timestamp: new Date().toISOString()
      });
    } finally {
      setDebugLoading(false);
    }
  };

  // Helper function to extract courses from query
  const extractCoursesFromQuery = (query: string): string[] => {
    const courseRegex = /\b[A-Z]{2,4}\s*\d{4}\b/g;
    return query.match(courseRegex) || [];
  };
  
  // Function to process the response and split it into semesters
  // Simplified semester processing function
  const processSemesters = (response: string) => {
    if (!response) return;
    
    // Try to find semester markers first (preferred format)
    const semesterMarkerRegex = /\*\*SEMESTER_MARKER:([^*]+)\*\*/g;
    const semesterMatches = [...response.matchAll(semesterMarkerRegex)];
    
    // If no markers found, try headings
    if (semesterMatches.length === 0) {
      const semesterHeadingRegex = /\*\*([^*]*(?:FALL|SPRING|SUMMER|WINTER)[^*]*)\*\*/g;
      const headingMatches = [...response.matchAll(semesterHeadingRegex)];
      
      if (headingMatches.length > 0) {
        processSemestersByMatches(headingMatches, response);
        return;
      }
      
      // If still no matches, use entire response
      setSemesters([{
        title: 'Schedule',
        content: response
      }]);
      setIsProcessed(true);
      return;
    }
    
    processSemestersByMatches(semesterMatches, response);
  };
  
  // Helper function to process semesters by regex matches
  const processSemestersByMatches = (matches: RegExpMatchArray[], response: string) => {
    const extractedSemesters: SemesterData[] = [];
    
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      
      const semesterTitle = currentMatch[1].trim();
      
      // Validate year is 2025 or later
      const yearMatch = semesterTitle.match(/(20\d{2})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      
      if (year < 2025) {
        console.warn(`Ignoring semester with year before 2025: ${semesterTitle}`);
        continue;
      }
      
      const startIndex = currentMatch.index + currentMatch[0].length;
      const endIndex = nextMatch ? nextMatch.index : response.length;
      
      const semesterContent = response.substring(startIndex, endIndex).trim();
      
      extractedSemesters.push({
        title: semesterTitle,
        content: semesterContent
      });
    }
    
    setSemesters(extractedSemesters);
    setIsProcessed(true);
  };

  // Touch/mouse event handlers for swipe functionality
  useEffect(() => {
    const slider = sliderRef.current;
    if (!slider) return;

    const handleTouchStart = (e: TouchEvent | MouseEvent) => {
      isDragging.current = true;
      startX.current = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    };

    const handleTouchMove = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current) return;
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent | MouseEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      
      const endX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
      const diffX = startX.current - endX;
      
      // Minimum swipe distance
      if (Math.abs(diffX) > 50) {
        if (diffX > 0) {
          // Swiped left - go to next semester
          goToNextSemester();
        } else {
          // Swiped right - go to previous semester
          goToPreviousSemester();
        }
      }
    };

    // Add event listeners for both touch and mouse events
    slider.addEventListener('touchstart', handleTouchStart, { passive: false });
    slider.addEventListener('touchmove', handleTouchMove, { passive: false });
    slider.addEventListener('touchend', handleTouchEnd, { passive: false });
    
    slider.addEventListener('mousedown', handleTouchStart);
    slider.addEventListener('mousemove', handleTouchMove);
    slider.addEventListener('mouseup', handleTouchEnd);

    return () => {
      slider.removeEventListener('touchstart', handleTouchStart);
      slider.removeEventListener('touchmove', handleTouchMove);
      slider.removeEventListener('touchend', handleTouchEnd);
      
      slider.removeEventListener('mousedown', handleTouchStart);
      slider.removeEventListener('mousemove', handleTouchMove);
      slider.removeEventListener('mouseup', handleTouchEnd);
    };
  }, []);

  // Function to navigate to the next semester
  const goToNextSemester = () => {
    if (currentSemesterIndex < semesters.length - 1) {
      setCurrentSemesterIndex(currentSemesterIndex + 1);
    }
  };

  // Function to navigate to the previous semester
  const goToPreviousSemester = () => {
    if (currentSemesterIndex > 0) {
      setCurrentSemesterIndex(currentSemesterIndex - 1);
    }
  };

  // Function to render response with inline citations
  const renderResponseWithCitations = (content: string) => {
    if (!content) return null;
    
    // If no citations, just return the content as paragraphs
    if (!citations.length) {
      return content.split('\n').map((line, index) => (
        <p key={index}>{line}</p>
      ));
    }
    
    // Sort citations by startIndex to process them in order
    const sortedCitations = [...citations].sort((a, b) => a.startIndex - b.startIndex);
    
    // Create an array of text segments and citation links
    const segments = [];
    let lastIndex = 0;
    
    sortedCitations.forEach((citation, index) => {
      // Add text before the citation
      if (citation.startIndex > lastIndex) {
        segments.push(
          <span key={`text-${index}`}>
            {content.substring(lastIndex, citation.startIndex)}
          </span>
        );
      }
      
      // Add the citation as a superscript link
      segments.push(
        <a 
          key={`citation-${index}`}
          href={citation.url}
          target="_blank"
          rel="noopener noreferrer"
          className="citation-link"
          title={citation.title}
        >
          <sup>[{index + 1}]</sup>
        </a>
      );
      
      lastIndex = citation.endIndex;
    });
    
    // Add any remaining text after the last citation
    if (lastIndex < content.length) {
      segments.push(
        <span key="text-end">
          {content.substring(lastIndex)}
        </span>
      );
    }
    
    return segments;
  };

  // Add this function to highlight professor information
  const highlightProfessorInfo = () => {
    if (!isProcessed || !mounted) return;
    
    setTimeout(() => {
      // Find all paragraphs in the semester content
      const paragraphs = document.querySelectorAll('.semester-content p');
      
      paragraphs.forEach(paragraph => {
        const text = paragraph.textContent || '';
        
        // Highlight professor information
        if (text.includes('Prof:')) {
          paragraph.classList.add('professor-info');
        }
        
        // Highlight ratings information
        if (text.includes('Rating:')) {
          paragraph.classList.add('ratings-info');
        }
      });
    }, 100); // Small delay to ensure content is rendered
  };

  // Call this function when the semester changes or content is processed
  useEffect(() => {
    highlightProfessorInfo();
  }, [currentSemesterIndex, isProcessed, mounted]);

  // Only render the component client-side to avoid hydration issues
  if (!mounted) {
    return null; // Return empty on server-side rendering
  }

  return (
    <div className="results-container">
      <Link href="/" className="back-button">
        &larr; Back to Search
      </Link>
      
      {/* Display major and university */}
      <div className="search-info">
        {major && <span className="major">{major}</span>}
        {university && <span className="university">{university}</span>}
      </div>
      
      {/* Web search indicator */}
      {usedWebSearch && (
        <div className="web-search-indicator">
          <FaSearch /> Web search was used to enhance results
        </div>
      )}
      
      {/* Display loading state */}
      {loading && <div className="loading-spinner">Loading...</div>}
      
      {/* Display error message */}
      {error && <div className="error-message">{error}</div>}
      
      {/* Display AI response with citations */}
      {!loading && !error && isProcessed && semesters.length > 0 && (
        <div className="ai-response" ref={sliderRef}>
          {/* Semester navigation */}
          <div className="semester-navigation">
            <button 
              onClick={goToPreviousSemester} 
              disabled={currentSemesterIndex === 0}
              className="semester-nav-button"
              aria-label="Previous semester"
            >
              <FaArrowLeft /> Previous
            </button>
            
            <h2 className="semester-title">
              {semesters[currentSemesterIndex].title}
            </h2>
            
            <button 
              onClick={goToNextSemester} 
              disabled={currentSemesterIndex === semesters.length - 1}
              className="semester-nav-button"
              aria-label="Next semester"
            >
              Next <FaArrowRight />
            </button>
          </div>
          
          <div className="semester-content">
            {renderResponseWithCitations(semesters[currentSemesterIndex].content)}
          </div>
          
          {/* Semester pagination indicator */}
          <div className="semester-pagination">
            {semesters.map((_, index) => (
              <button
                key={index}
                className={`semester-dot ${index === currentSemesterIndex ? 'active' : ''}`}
                onClick={() => setCurrentSemesterIndex(index)}
                aria-label={`Go to semester ${index + 1}`}
              />
            ))}
          </div>
          
          {/* Swipe instruction */}
          {semesters.length > 1 && (
            <div className="swipe-instruction">
              Swipe left/right to navigate between semesters
            </div>
          )}
          
          {/* Display citation list if there are citations */}
          {citations.length > 0 && (
            <div className="citations-list">
              <h3>Sources</h3>
              <ol>
                {citations.map((citation, index) => (
                  <li key={index}>
                    <a 
                      href={citation.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="citation-source"
                    >
                      <FaLink className="citation-icon" />
                      {citation.title || citation.url}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Debug Data Section */}
      <div className="debug-section">
        <div className="debug-header">
          <button 
            onClick={() => setShowDebugData(!showDebugData)}
            className="debug-toggle-button"
          >
            <FaBug /> 
            {showDebugData ? <FaEyeSlash /> : <FaEye />}
            {showDebugData ? 'Hide' : 'Show'} Scraped Data Debug
          </button>
          
          {!showDebugData && (
            <button 
              onClick={fetchDebugData}
              disabled={debugLoading}
              className="debug-fetch-button"
            >
              {debugLoading ? 'Fetching...' : 'Fetch Fresh Debug Data'}
            </button>
          )}
        </div>

        {showDebugData && (
          <div className="debug-content">
            <div className="debug-controls">
              <button 
                onClick={fetchDebugData}
                disabled={debugLoading}
                className="debug-refresh-button"
              >
                {debugLoading ? 'Fetching...' : 'Refresh Debug Data'}
              </button>
            </div>

            {debugLoading && (
              <div className="debug-loading">
                <div className="loading-spinner">Fetching debug data...</div>
              </div>
            )}

            {debugData.timestamp && (
              <div className="debug-timestamp">
                Last updated: {new Date(debugData.timestamp).toLocaleString()}
              </div>
            )}

            {/* Professor Data Section */}
            {debugData.professorData && (
              <div className="debug-section-item">
                <h3>🎓 Professor Data</h3>
                <div className="debug-data-container">
                  <pre className="debug-json">
                    {JSON.stringify(debugData.professorData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* Scraping Logs Section */}
            {debugData.scrapingLogs && debugData.scrapingLogs.length > 0 && (
              <div className="debug-section-item">
                <h3>📝 Scraping Logs</h3>
                <div className="debug-logs">
                  {debugData.scrapingLogs.map((log, index) => (
                    <div key={index} className="debug-log-entry">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw Data Section */}
            {debugData.rawData && (
              <div className="debug-section-item">
                <h3>🔍 Raw Scraped Data</h3>
                <div className="debug-data-container">
                  <pre className="debug-json">
                    {JSON.stringify(debugData.rawData, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {/* No Debug Data Message */}
            {!debugLoading && !debugData.professorData && !debugData.scrapingLogs && !debugData.rawData && (
              <div className="debug-no-data">
                <p>No debug data available. Click "Fetch Fresh Debug Data" to see what Playwright is scraping.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}