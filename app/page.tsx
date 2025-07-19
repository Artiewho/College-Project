'use client';

import Image from "next/image";
import { useEffect, useState, useRef } from 'react';

export default function Home() {
  // Client-side mounting state to prevent hydration issues
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [typingText, setTypingText] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [universitySearchValue, setUniversitySearchValue] = useState('');
  const [showUniversitySelect, setShowUniversitySelect] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [selectedUniversity, setSelectedUniversity] = useState('');
  
  const typingTextRef = useRef<HTMLDivElement>(null);
  const universitySelectRef = useRef<HTMLSelectElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Animation state references
  const textsRef = useRef([
    "Get Help With Class Scheduling",
    "Get Help With Professors",
    "Get Help With Counseling"
  ]);
  const currentIndexRef = useRef(0);
  const isDeletingRef = useRef(false);
  
  // Fixed timing values for consistent animation
  const typingIntervalRef = useRef(100); // Consistent typing interval (ms)
  const deletingIntervalRef = useRef(80);  // Consistent deleting interval (ms)
  const pauseAfterTypingRef = useRef(2000); // Pause after completing typing (ms)
  const pauseAfterDeletingRef = useRef(500); // Pause after completing deletion (ms)

  // Handle search input changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
  };

  // Handle search form submission
  const handleSearchSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      e.preventDefault();
      window.location.href = `results.html?q=${encodeURIComponent(searchValue.trim())}`;
    }
  };

  // Handle university search input changes
  const handleUniversitySearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value.toLowerCase();
    setUniversitySearchValue(searchTerm);
    
    if (universitySelectRef.current) {
      const options = Array.from(universitySelectRef.current.options);
      const filtered = options
        .filter(option => option.text.toLowerCase().includes(searchTerm))
        .map(option => option.text);
      
      setFilteredOptions(filtered);
    }
    
    setShowUniversitySelect(true);
  };

  // Handle university selection
  const handleUniversitySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedUniversity(e.target.value);
    if (e.target.selectedIndex >= 0) {
      setUniversitySearchValue(e.target.options[e.target.selectedIndex].text);
    }
    setShowUniversitySelect(false);
  };

  // Handle click outside university select
  useEffect(() => {
    if (!mounted) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (universitySelectRef.current && !(e.target as Element).closest('.university-select-container')) {
        setShowUniversitySelect(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [mounted]);

  // Initialize component and start animation
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
      document.documentElement.style.setProperty('--bg-color', '#333');
      document.documentElement.style.setProperty('--text-color', '#f8f8f8');
    } else {
      document.body.classList.remove('dark-mode');
      document.documentElement.style.setProperty('--bg-color', 'white');
      document.documentElement.style.setProperty('--text-color', '#333');
    }
    
    // Save preference to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    }
  }, [isDarkMode, mounted]);
  
  // Typing animation effect - only run on client
  useEffect(() => {
    if (!mounted) return;
    
    let timer: NodeJS.Timeout;
    
    // Typing animation with consistent timing
    const animateText = () => {
      const texts = textsRef.current;
      const currentIndex = currentIndexRef.current;
      const isDeleting = isDeletingRef.current;
      const fullText = texts[currentIndex];
      
      // Handle typing or deleting with consistent intervals
      if (isDeleting) {
        setTypingText(prev => prev.substring(0, prev.length - 1));
      } else {
        setTypingText(prev => fullText.substring(0, prev.length + 1));
      }

      // Determine the next step based on current state
      let nextStepDelay;
      
      // Case 1: Just finished typing the full text
      if (!isDeleting && typingText === fullText) {
        isDeletingRef.current = true;
        nextStepDelay = pauseAfterTypingRef.current;
      }
      // Case 2: Just finished deleting all text
      else if (isDeleting && typingText === '') {
        isDeletingRef.current = false;
        currentIndexRef.current = (currentIndex + 1) % texts.length;
        nextStepDelay = pauseAfterDeletingRef.current;
      }
      // Case 3: In the middle of typing
      else if (!isDeleting) {
        nextStepDelay = typingIntervalRef.current;
      }
      // Case 4: In the middle of deleting
      else {
        nextStepDelay = deletingIntervalRef.current;
      }
      
      // Schedule the next animation step with consistent timing
      timer = setTimeout(animateText, nextStepDelay);
    };

    // Start the animation
    timer = setTimeout(animateText, typingIntervalRef.current);
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
    };
  }, [typingText, mounted]); // Add mounted as a dependency

  // Toggle dark mode function
  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  // Only render the component client-side to avoid hydration issues
  if (!mounted) return null;

  return (
    <div className="search-container">
      <div className="typing-text" ref={typingTextRef}>{typingText}</div>
      <div className="search-input-container">
        <input 
          type="text" 
          className="search-input" 
          placeholder="Search..." 
          value={searchValue}
          onChange={handleSearchChange}
          onKeyPress={handleSearchSubmit}
          ref={searchInputRef}
        />
        <label className="upload-button">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <line x1="12" y1="8" x2="12" y2="16" stroke="currentColor" strokeWidth="2"/>
            <line x1="8" y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="2"/>
          </svg>
          Images
          <input type="file" accept="image/*" />
        </label>
        <div className="university-select-container">
          <input 
            type="text" 
            className="university-search" 
            placeholder="Search university..." 
            value={universitySearchValue}
            onChange={handleUniversitySearchChange}
            onFocus={() => setShowUniversitySelect(true)}
          />
          <select 
            className="university-select" 
            size={8}
            style={{ display: showUniversitySelect ? 'block' : 'none' }}
            onChange={handleUniversitySelect}
            ref={universitySelectRef}
            value={selectedUniversity}
          >
            <option value="" disabled>Select University</option>
            <option value="bu">Boston University</option>
            <option value="caltech">California Institute of Technology</option>
            <option value="cmu">Carnegie Mellon University</option>
            <option value="columbia">Columbia University</option>
            <option value="cornell">Cornell University</option>
            <option value="duke">Duke University</option>
            <option value="emory">Emory University</option>
            <option value="gatech">Georgia Institute of Technology</option>
            <option value="harvard">Harvard University</option>
            <option value="jhu">Johns Hopkins University</option>
            <option value="mit">Massachusetts Institute of Technology</option>
            <option value="northwestern">Northwestern University</option>
            <option value="psu">Penn State University</option>
            <option value="princeton">Princeton University</option>
            <option value="purdue">Purdue University</option>
            <option value="rice">Rice University</option>
            <option value="stanford">Stanford University</option>
            <option value="uci">University of California, Irvine</option>
            <option value="ucla">University of California, Los Angeles</option>
            <option value="ucsd">University of California, San Diego</option>
            <option value="berkeley">University of California, Berkeley</option>
            <option value="uchicago">University of Chicago</option>
            <option value="uiuc">University of Illinois Urbana–Champaign</option>
            <option value="umass">University of Massachusetts Amherst</option>
            <option value="umich">University of Michigan–Ann Arbor</option>
            <option value="umn">University of Minnesota–Twin Cities</option>
            <option value="unc">University of North Carolina at Chapel Hill</option>
            <option value="upenn">University of Pennsylvania</option>
            <option value="usc">University of Southern California</option>
            <option value="utexas">University of Texas at Austin</option>
            <option value="uva">University of Virginia</option>
            <option value="uw">University of Washington, Seattle</option>
            <option value="wisc">University of Wisconsin–Madison</option>
            <option value="wustl">Washington University in St. Louis</option>
            <option value="yale">Yale University</option>
          </select>
        </div>
        <div 
          className={`dark-mode-toggle ${isDarkMode ? 'active' : ''}`}
          onClick={toggleDarkMode}
          suppressHydrationWarning={true}
        >
          <div className="slider"></div>
        </div>
      </div>
    </div>
  );
}
