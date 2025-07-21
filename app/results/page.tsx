'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { FaSearch, FaLink, FaArrowLeft, FaArrowRight } from 'react-icons/fa';

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
        setIsProcessed(false); // Reset processed state
        
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
          throw new Error(`Error: ${response.status}`);
        }
    
        const data = await response.json();
        setAiResponse(data.response);
    
        // Check if web search was used
        if (data.usedWebSearch) {
          setUsedWebSearch(true);
        }
        
        // Set citations if available
        if (data.citations && data.citations.length > 0) {
          setCitations(data.citations);
        }
        
        // Process the response to extract semesters
        processSemesters(data.response);
      } catch (err) {
        console.error('Error fetching AI response:', err);
        setError('Failed to get AI response. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchAiResponse();
  }, [query, mounted]);
  
  // Function to process the response and split it into semesters
  // Add this to the processSemesters function
  
  const processSemesters = (response: string) => {
    if (!response) return;
    
    // Split the response by semester markers
    const semesterMarkerRegex = /\*\*SEMESTER_MARKER:([^*]+)\*\*/g;
    const semesterMatches = [...response.matchAll(semesterMarkerRegex)];
    
    if (semesterMatches.length === 0) {
      // If no semester markers found, try to identify semesters by headings
      const semesterHeadingRegex = /\*\*([^*]*(?:FALL|SPRING|SUMMER|WINTER)[^*]*)\*\*/g;
      const headingMatches = [...response.matchAll(semesterHeadingRegex)];
      
      if (headingMatches.length > 0) {
        // Process using heading matches
        const extractedSemesters: SemesterData[] = [];
        
        for (let i = 0; i < headingMatches.length; i++) {
          const currentMatch = headingMatches[i];
          const nextMatch = headingMatches[i + 1];
          
          const semesterTitle = currentMatch[1].trim();
          
          // Validate the semester year is 2025 or later
          const yearMatch = semesterTitle.match(/(20\d{2})/);
          const year = yearMatch ? parseInt(yearMatch[1]) : 0;
          
          if (year < 2025) {
            console.warn(`Ignoring semester with year before 2025: ${semesterTitle}`);
            continue; // Skip this semester
          }
          
          const startIndex = currentMatch.index + currentMatch[0].length;
          const endIndex = nextMatch ? nextMatch.index : response.length;
          
          const semesterContent = response.substring(startIndex, endIndex).trim();
          
          extractedSemesters.push({
            title: semesterTitle,
            content: `**${semesterTitle}**\n\n${semesterContent}`
          });
        }
        
        setSemesters(extractedSemesters);
        setIsProcessed(true);
        return;
      }
      
      // If still no matches, treat the entire response as one semester
      setSemesters([{
        title: 'Schedule',
        content: response
      }]);
      setIsProcessed(true);
      return;
    }
    
    const extractedSemesters: SemesterData[] = [];
    
    // Process each semester
    for (let i = 0; i < semesterMatches.length; i++) {
      const currentMatch = semesterMatches[i];
      const nextMatch = semesterMatches[i + 1];
      
      const semesterTitle = currentMatch[1].trim();
      
      // Validate the semester year is 2025 or later
      const yearMatch = semesterTitle.match(/(20\d{2})/);
      const year = yearMatch ? parseInt(yearMatch[1]) : 0;
      
      if (year < 2025) {
        console.warn(`Ignoring semester with year before 2025: ${semesterTitle}`);
        continue; // Skip this semester
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
      
      const currentX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const diff = startX.current - currentX;
      
      // Determine swipe direction based on threshold
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentSemesterIndex < semesters.length - 1) {
          // Swipe left - go to next semester
          setCurrentSemesterIndex(currentSemesterIndex + 1);
        } else if (diff < 0 && currentSemesterIndex > 0) {
          // Swipe right - go to previous semester
          setCurrentSemesterIndex(currentSemesterIndex - 1);
        }
        isDragging.current = false;
      }
    };

    const handleTouchEnd = () => {
      isDragging.current = false;
    };

    // Add event listeners
    slider.addEventListener('touchstart', handleTouchStart as EventListener);
    slider.addEventListener('touchmove', handleTouchMove as EventListener);
    slider.addEventListener('touchend', handleTouchEnd);
    slider.addEventListener('mousedown', handleTouchStart as EventListener);
    slider.addEventListener('mousemove', handleTouchMove as EventListener);
    slider.addEventListener('mouseup', handleTouchEnd);
    slider.addEventListener('mouseleave', handleTouchEnd);

    // Clean up event listeners
    return () => {
      slider.removeEventListener('touchstart', handleTouchStart as EventListener);
      slider.removeEventListener('touchmove', handleTouchMove as EventListener);
      slider.removeEventListener('touchend', handleTouchEnd);
      slider.removeEventListener('mousedown', handleTouchStart as EventListener);
      slider.removeEventListener('mousemove', handleTouchMove as EventListener);
      slider.removeEventListener('mouseup', handleTouchEnd);
      slider.removeEventListener('mouseleave', handleTouchEnd);
    };
  }, [currentSemesterIndex, semesters.length]);

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
  if (!mounted) return null;

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
    </div>
  );
}