'use client';

import Image from "next/image";
import { useEffect, useState, useRef } from 'react';
import Script from 'next/script';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [typingText, setTypingText] = useState('');
  const typingTextRef = useRef<HTMLDivElement>(null);
  
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

  useEffect(() => {
    setMounted(true);
    let timer: NodeJS.Timeout;
    
    // Check if dark mode was previously enabled
    if (typeof window !== 'undefined') {
      const savedDarkMode = localStorage.getItem('darkMode') === 'enabled';
      setIsDarkMode(savedDarkMode);
      if (savedDarkMode) {
        document.body.classList.add('dark-mode');
      }
    }
    
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

    // University search functionality
    const searchInput = document.querySelector('.university-search');
    const select = document.querySelector('.university-select');
    if (searchInput && select) {
      const options = Array.from((select as HTMLSelectElement).options);

      searchInput.addEventListener('focus', function() {
        (select as HTMLSelectElement).style.display = 'block';
      });

      searchInput.addEventListener('input', function() {
        const searchTerm = ((searchInput as HTMLInputElement).value).toLowerCase();
        
        options.forEach(option => {
          const text = (option as HTMLOptionElement).text.toLowerCase();
          (option as HTMLOptionElement).style.display = text.includes(searchTerm) ? '' : 'none';
        });

        (select as HTMLSelectElement).style.display = 'block';
      });

      select.addEventListener('change', function() {
        (searchInput as HTMLInputElement).value = (select as HTMLSelectElement).options[(select as HTMLSelectElement).selectedIndex].text;
        (select as HTMLSelectElement).style.display = 'none';
      });

      document.addEventListener('click', function(e) {
        if (!(e.target as Element).closest('.university-select-container')) {
          (select as HTMLSelectElement).style.display = 'none';
        }
      });
    }

    // Dark mode toggle functionality
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const universitySelect = document.querySelector('.university-select');
    if (darkModeToggle && universitySelect) {
      // Check if dark mode was previously enabled
      if (localStorage.getItem('darkMode') === 'enabled') {
        darkModeToggle.classList.add('active');
        document.body.classList.add('dark-mode');
        applyDarkModeToSelect(true);
        setIsDarkMode(true);
      }
      
      darkModeToggle.addEventListener('click', function() {
        (darkModeToggle as HTMLElement).classList.toggle('active');
        const isDarkMode = document.body.classList.toggle('dark-mode');
        applyDarkModeToSelect(isDarkMode);
        setIsDarkMode(isDarkMode);
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
      });
    }
    
    function applyDarkModeToSelect(isDarkMode: boolean) {
      const universitySelect = document.querySelector('.university-select') as HTMLSelectElement;
      const universityOptions = Array.from(universitySelect.options);
      
      if (isDarkMode) {
        universitySelect.style.backgroundColor = '#333';
        universitySelect.style.color = '#f8f8f8';
        universitySelect.style.borderColor = '#555';
        
        universityOptions.forEach(option => {
          (option as HTMLOptionElement).style.backgroundColor = '#333';
          (option as HTMLOptionElement).style.color = '#f8f8f8';
        });
      } else {
        universitySelect.style.backgroundColor = 'white';
        universitySelect.style.color = '#333';
        universitySelect.style.borderColor = '#ddd';
        
        universityOptions.forEach(option => {
          (option as HTMLOptionElement).style.backgroundColor = 'white';
          (option as HTMLOptionElement).style.color = '#333';
        });
      }
    }
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
    };
  }, [typingText]); // Add typingText as a dependency

  // Effect to handle dark mode changes
  useEffect(() => {
    if (!mounted) return;
    
    // Apply dark mode to body
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
    
    // Apply dark mode to select element
    const universitySelect = document.querySelector('.university-select') as HTMLSelectElement;
    if (universitySelect) {
      const universityOptions = Array.from(universitySelect.options);
      
      if (isDarkMode) {
        universitySelect.style.backgroundColor = '#333';
        universitySelect.style.color = '#f8f8f8';
        universitySelect.style.borderColor = '#555';
        
        universityOptions.forEach(option => {
          (option as HTMLOptionElement).style.backgroundColor = '#333';
          (option as HTMLOptionElement).style.color = '#f8f8f8';
        });
      } else {
        universitySelect.style.backgroundColor = 'white';
        universitySelect.style.color = '#333';
        universitySelect.style.borderColor = '#ddd';
        
        universityOptions.forEach(option => {
          (option as HTMLOptionElement).style.backgroundColor = 'white';
          (option as HTMLOptionElement).style.color = '#333';
        });
      }
    }
    
    // Save preference to localStorage
    localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
  }, [isDarkMode, mounted]);

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
        <input type="text" className="search-input" placeholder="Search..." autoFocus />
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
          <input type="text" className="university-search" placeholder="Search university..." />
          <select className="university-select" size={8}>
            <option value="" disabled selected>Select University</option>
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
        >
          <div className="slider"></div>
        </div>
      </div>
    </div>
  );
}
