import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

// Interface for professor data
interface ProfessorData {
  name: string;
  rating?: number;
  difficulty?: number;
  wouldTakeAgain?: number;
  avgGPA?: number;
  numRatings?: number;
  department?: string;
  url?: string;
  course?: string; 
  currentlyTeaching?: boolean;
  source?: string; // Add this property to track data source
  teachesClass?: boolean; // Explicitly indicates if professor teaches this specific class
}

/**
 * Scrape Rate My Professor for professor information
 */
async function scrapeRateMyProfessor(university: string, professorName?: string, course?: string): Promise<ProfessorData[]> {
  const browser = await chromium.launch({ headless: true });
  const results: ProfessorData[] = [];
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to Rate My Professor search page
    await page.goto('https://www.ratemyprofessors.com/');
    
    // Search for the university - be more specific with university name
    await page.fill('input[placeholder="Your school"]', university);
    await page.waitForTimeout(1500); // Increased wait time for better results
    
    // Click on the first university result
    const schoolResults = await page.$$('.SearchResultsPage__StyledSearchResultsPage-sc-1srop1v-0');
    if (schoolResults.length > 0) {
      await schoolResults[0].click();
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      
      // Store the current URL to confirm we're on the correct school page
      const currentUrl = page.url();
      console.log(`Navigated to school page: ${currentUrl}`);
      
      // If professor name is provided, search for that professor
      if (professorName) {
        await page.fill('input[placeholder="Search for your professor"]', professorName);
        await page.press('input[placeholder="Search for your professor"]', 'Enter');
        await page.waitForTimeout(2500); // Increased wait time
        
        // Extract professor data from search results
        const professorCards = await page.$$('.TeacherCard__StyledTeacherCard-syjs0d-0');
        
        for (const card of professorCards) {
          const name = await card.evaluate(el => el.querySelector('.CardName__StyledCardName-sc-1gyrgim-0')?.textContent || '');
          const rating = await card.evaluate(el => {
            const ratingEl = el.querySelector('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
            return ratingEl ? parseFloat(ratingEl.textContent || '0') : undefined;
          });
          
          const department = await card.evaluate(el => el.querySelector('.CardSchool__Department-sc-19lmz2k-0')?.textContent || '');
          const url = await card.evaluate(el => el.querySelector('a')?.href || '');
          
          // Add difficulty and would take again metrics
          const difficulty = await card.evaluate(el => {
            const difficultyText = el.textContent;
            const difficultyMatch = difficultyText.match(/Difficulty:\s*(\d+\.?\d*)/i);
            return difficultyMatch ? parseFloat(difficultyMatch[1]) : undefined;
          });
          
          const wouldTakeAgain = await card.evaluate(el => {
            const againText = el.textContent;
            const againMatch = againText.match(/Would take again:\s*(\d+)%/i);
            return againMatch ? parseInt(againMatch[1]) : undefined;
          });
          
          // Inside the professor search section (around line 65)
          results.push({
            name,
            rating,
            difficulty,
            wouldTakeAgain,
            department,
            url,
            source: 'Rate My Professor',
            teachesClass: false // By default, we don't know if they teach this specific class
          });
        }
      } else if (course) {
        // If no professor name but course is provided, search for professors teaching that course
        // This is a new implementation to focus on professors within the selected school
        await page.fill('input[placeholder="Search for your professor"]', course);
        await page.press('input[placeholder="Search for your professor"]', 'Enter');
        await page.waitForTimeout(2500);
        
        // Extract professor data from search results
        const professorCards = await page.$$('.TeacherCard__StyledTeacherCard-syjs0d-0');
        
        for (const card of professorCards) {
          // Same extraction logic as above
          const name = await card.evaluate(el => el.querySelector('.CardName__StyledCardName-sc-1gyrgim-0')?.textContent || '');
          const rating = await card.evaluate(el => {
            const ratingEl = el.querySelector('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
            return ratingEl ? parseFloat(ratingEl.textContent || '0') : undefined;
          });
          
          const department = await card.evaluate(el => el.querySelector('.CardSchool__Department-sc-19lmz2k-0')?.textContent || '');
          const url = await card.evaluate(el => el.querySelector('a')?.href || '');
          
          // Check if this professor teaches the course we're looking for
          const teachesRelevantCourse = department.toLowerCase().includes(course.toLowerCase()) || 
                                       await card.evaluate(el => {
                                         const courseText = el.textContent || '';
                                         return courseText.toLowerCase().includes(course.toLowerCase());
                                       });
          
          if (teachesRelevantCourse) {
            // Inside the course search section (around line 120)
            results.push({
              name,
              rating,
              department,
              url,
              source: 'Rate My Professor',
              teachesClass: true // This professor likely teaches this class based on RMP data
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error scraping Rate My Professor:', error);
  } finally {
    await browser.close();
  }
  
  return results;
}

/**
 * Scrape Course Critique for professor and course information
 */
async function scrapeCourseEval(university: string, course?: string, professorName?: string): Promise<ProfessorData[]> {
  const results: ProfessorData[] = [];
  
  try {
    // For Georgia Tech's Course Critique
    if (university.toLowerCase().includes('georgia tech') && course) {
      // Extract course code if it's embedded in a longer string
      const courseCode = course.match(/([A-Z]{2,4})\s*(\d{4})/i);
      const searchTerm = courseCode ? `${courseCode[1]} ${courseCode[2]}` : course;
      
      console.log(`Searching Course Critique API for: ${searchTerm}`);
      
      // Get current year and semester
      const date = new Date();
      const currentYear = date.getFullYear();
      let currentSemester = '';
      const month = date.getMonth() + 1; // JavaScript months are 0-indexed
      
      // Determine current semester based on month
      if (month >= 1 && month <= 5) {
        currentSemester = 'spring';
      } else if (month >= 6 && month <= 7) {
        currentSemester = 'summer';
      } else {
        currentSemester = 'fall';
      }
      
      // First try to get current semester data from OSCAR API
      const oscarApiUrl = `https://critique.gatech.edu/api/oscar/${courseCode[1]}/${courseCode[2]}/${currentYear}/${currentSemester}`;
      
      console.log(`Checking OSCAR API for current teaching professors: ${oscarApiUrl}`);
      
      try {
        const oscarResponse = await fetch(oscarApiUrl);
        const oscarData = await oscarResponse.json();
        
        // If we have section data with professors
        if (oscarData && Array.isArray(oscarData) && oscarData.length > 0) {
          console.log(`Found ${oscarData.length} sections in current semester`);
          
          // Extract unique professor names from current sections
          const currentProfessors = new Set();
          
          oscarData.forEach(section => {
            if (section.instructors && Array.isArray(section.instructors)) {
              section.instructors.forEach(instructor => {
                currentProfessors.add(instructor);
              });
            }
          });
          
          console.log(`Current teaching professors: ${Array.from(currentProfessors).join(', ')}`);
          
          // Now get historical GPA data from Course Critique API
          const apiUrl = `https://c4citk6s9k.execute-api.us-east-1.amazonaws.com/test/data/course?courseID=${encodeURIComponent(searchTerm)}`;
          
          const response = await fetch(apiUrl);
          const data = await response.json();
          
          if (data && data.raw && Array.isArray(data.raw)) {
            // Filter professors to only include those teaching in current semester
            const currentProfessorsList = Array.from(currentProfessors) as string[];
            const filteredProfessors = data.raw.filter(prof => 
              currentProfessorsList.some(currentProf => 
                currentProf.toLowerCase().includes(prof.instructor_name.toLowerCase()) ||
                prof.instructor_name.toLowerCase().includes(currentProf.toLowerCase())
              )
            );
            
            // Sort professors by GPA (highest first)
            const sortedProfessors = [...filteredProfessors].sort((a, b) => {
              if (a.GPA !== undefined && b.GPA !== undefined) {
                return b.GPA - a.GPA;
              }
              return 0;
            });
            
            // Take professors with highest GPAs
            for (const prof of sortedProfessors) {
              // Inside the OSCAR API section (around line 220)
              results.push({
                name: prof.instructor_name,
                avgGPA: prof.GPA,
                numRatings: prof.sections, // Number of sections taught
                course: searchTerm,
                currentlyTeaching: true,
                source: 'Course Critique (Current Semester)',
                teachesClass: true // This professor definitely teaches this class
              });
              
              // If we found current professors, return them
              if (results.length > 0) {
                return results;
              }
            }
            
            // Inside the fallback section (around line 250)
            results.push({
              name: prof.instructor_name,
              avgGPA: prof.GPA,
              numRatings: prof.sections, // Number of sections taught
              course: searchTerm,
              currentlyTeaching: false, // Mark as not currently teaching since we're using historical data
              source: 'Course Critique (Historical)',
              teachesClass: false // We don't know for sure if they teach this class currently
            });
          }
        }
      } catch (oscarError) {
        console.error('Error fetching from OSCAR API:', oscarError);
        // Continue to fallback method if OSCAR API fails
      }
      
      // Fallback: Use the Course Critique API for historical data
      console.log('Falling back to Course Critique API for historical data');
      const apiUrl = `https://c4citk6s9k.execute-api.us-east-1.amazonaws.com/test/data/course?courseID=${encodeURIComponent(searchTerm)}`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      if (data && data.raw && Array.isArray(data.raw)) {
        // Sort professors by GPA (highest first)
        const sortedProfessors = [...data.raw].sort((a, b) => {
          if (a.GPA !== undefined && b.GPA !== undefined) {
            return b.GPA - a.GPA;
          }
          return 0;
        });
        
        // Take top professors with highest GPAs
        for (const prof of sortedProfessors) {
          results.push({
            name: prof.instructor_name,
            avgGPA: prof.GPA,
            numRatings: prof.sections, // Number of sections taught
            course: searchTerm,
            currentlyTeaching: false // Mark as not currently teaching since we're using historical data
          });
        }
      }
    } else {
      // Generic implementation for other universities
      console.log(`No specific implementation for university: ${university}`);
    }
  } catch (error) {
    console.error('Error fetching from Course Critique API:', error);
  }
  
  return results;
}

/**
 * API route handler for scraping professor information
 */
export async function POST(request: NextRequest) {
  try {
    const { university, course, professorName, major } = await request.json();
    
    if (!university) {
      return NextResponse.json({ error: 'University name is required' }, { status: 400 });
    }
    
    // For Georgia Tech, follow the new research order
    if (university.toLowerCase().includes('georgia tech')) {
      console.log('Georgia Tech detected - using new research order');
      
      // Step 1: Find major requirements if major is provided
      let requiredCourses: string[] = [];
      if (major) {
        console.log(`Finding requirements for major: ${major}`);
        requiredCourses = await scrapeMajorRequirements(university, major);
        console.log(`Found required courses: ${requiredCourses.join(', ')}`);
      }
      
      // If no major or no courses found, use the provided course
      if (requiredCourses.length === 0 && course) {
        requiredCourses = [course];
      }
      
      // Step 2 & 3: For each required course, find classes with highest GPAs and their professors
      const allResults: ProfessorData[] = [];
      
      for (const requiredCourse of requiredCourses) {
        // Get course data from Course Critique
        const courseEvalResults = await scrapeCourseEval(university, requiredCourse);
        
        if (courseEvalResults.length > 0) {
          // Add course information to each professor
          courseEvalResults.forEach(prof => {
            prof.course = requiredCourse;
          });
          
          allResults.push(...courseEvalResults);
        }
      }
      
      // Step 4: Use Rate My Professor as a double-check for professors found
      const professorNames = allResults.map(prof => prof.name);
      const rmpResults: ProfessorData[] = [];
      
      for (const name of professorNames) {
        const profRmpData = await scrapeRateMyProfessor(university, name);
        rmpResults.push(...profRmpData);
      }
      
      // Combine results, prioritizing Course Critique data but enhancing with RMP data
      const combinedResults = mergeResultsWithGPAPriority(rmpResults, allResults);
      
      // Group results by course for better organization
      const courseGroups = new Map<string, ProfessorData[]>();
      
      for (const prof of combinedResults) {
        const course = prof.course || 'Unknown';
        if (!courseGroups.has(course)) {
          courseGroups.set(course, []);
        }
        courseGroups.get(course)!.push(prof);
      }
      
      // For each course, keep only the top professors by GPA who actually teach the class
      const finalResults: ProfessorData[] = [];
      
      for (const [course, professors] of courseGroups.entries()) {
      // First, filter professors who actually teach the class
      const teachingProfessors = professors.filter(prof => prof.teachesClass === true);
      
      // If we have professors who teach the class, use only them
      const profesToUse = teachingProfessors.length > 0 ? teachingProfessors : professors;
      
      // Sort by GPA
      profesToUse.sort((a, b) => {
        if (a.avgGPA !== undefined && b.avgGPA !== undefined) {
          return b.avgGPA - a.avgGPA;
        }
        return 0;
      });
      
      // Take top 3 professors for each course
      finalResults.push(...profesToUse.slice(0, 3));
      }
      
      return NextResponse.json({
        professors: finalResults,
        requiredCourses: requiredCourses
      });
    } else {
      // For other universities, use the existing approach
      const [rmpResults, courseEvalResults] = await Promise.all([
        scrapeRateMyProfessor(university, professorName, course),
        scrapeCourseEval(university, course, professorName)
      ]);
      
      // Combine and process results
      const combinedResults = mergeResults(rmpResults, courseEvalResults);
      
      return NextResponse.json({
        professors: combinedResults
      });
    }
  } catch (error) {
    console.error('Error in scraper API:', error);
    return NextResponse.json(
      { error: 'Failed to scrape professor information' },
      { status: 500 }
    );
  }
}

/**
 * Merge results from both sources, prioritizing GPA above all else
 */
function mergeResultsWithGPAPriority(rmpResults: ProfessorData[], courseEvalResults: ProfessorData[]): ProfessorData[] {
  const mergedMap = new Map<string, ProfessorData>();
  
  // Process Course Eval results first (priority)
  for (const prof of courseEvalResults) {
    mergedMap.set(prof.name.toLowerCase(), prof);
  }
  
  // Merge with RMP results (secondary) - only use RMP for professors already found in Course Critique
  for (const prof of rmpResults) {
    const key = prof.name.toLowerCase();
    if (mergedMap.has(key)) {
      // Merge with existing entry, but preserve Course Critique data
      const existing = mergedMap.get(key)!;
      const merged = { ...prof, ...existing };
      
      // Ensure we keep the Course Critique data if it exists
      if (existing.avgGPA !== undefined) {
        merged.avgGPA = existing.avgGPA;
      }
      if (existing.numRatings !== undefined) {
        merged.numRatings = existing.numRatings;
      }
      // Preserve the source information from Course Critique
      if (existing.source) {
        merged.source = existing.source;
      }
      // Preserve teaching information - prioritize OSCAR API data
      if (existing.teachesClass !== undefined) {
        merged.teachesClass = existing.teachesClass;
      }
      
      mergedMap.set(key, merged);
    }
    // Skip professors not found in Course Critique
  }
  
  // Convert map to array and sort ONLY by GPA (highest first)
  return Array.from(mergedMap.values())
    .sort((a, b) => {
      // Sort by GPA only
      if (a.avgGPA !== undefined && b.avgGPA !== undefined) {
        return b.avgGPA - a.avgGPA;
      }
      // Prioritize entries with GPA
      if (a.avgGPA !== undefined && b.avgGPA === undefined) {
        return -1;
      }
      if (a.avgGPA === undefined && b.avgGPA !== undefined) {
        return 1;
      }
      return 0;
    });
}

// Add this new function after the existing scraper functions
async function scrapeMajorRequirements(university: string, major: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const requiredCourses: string[] = [];
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // For Georgia Tech
    if (university.toLowerCase().includes('georgia tech')) {
      // Navigate to Georgia Tech's degree requirements page
      await page.goto('https://catalog.gatech.edu/programs/');
      
      // Search for the major
      const searchTerm = major.toLowerCase();
      console.log(`Searching for major: ${searchTerm}`);
      
      // Find and click on the major link
      const majorLinks = await page.$$('a');
      let majorFound = false;
      
      for (const link of majorLinks) {
        const text = await link.textContent();
        if (text && text.toLowerCase().includes(searchTerm)) {
          console.log(`Found major link: ${text}`);
          await link.click();
          await page.waitForTimeout(2000);
          majorFound = true;
          break;
        }
      }
      
      if (majorFound) {
        // Look for course requirements
        const courseElements = await page.$$('table tr, .course-block');
        
        for (const element of courseElements) {
          const text = await element.textContent();
          
          // Extract course codes using regex
          const courseMatches = text?.match(/([A-Z]{2,4}\s*\d{4})/g);
          if (courseMatches) {
            for (const course of courseMatches) {
              if (!requiredCourses.includes(course)) {
                requiredCourses.push(course);
              }
            }
          }
        }
      }
    } else {
      // Generic implementation for other universities would go here
      console.log(`No specific implementation for university: ${university}`);
    }
  } catch (error) {
    console.error('Error scraping major requirements:', error);
  } finally {
    await browser.close();
  }
  
  return requiredCourses;
}