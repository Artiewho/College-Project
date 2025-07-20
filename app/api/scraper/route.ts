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
          
          results.push({
            name,
            rating,
            difficulty,
            wouldTakeAgain,
            department,
            url
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
            results.push({
              name,
              rating,
              department,
              url
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
  // This implementation will vary based on the university's course critique system
  const browser = await chromium.launch({ headless: true });
  const results: ProfessorData[] = [];
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // For Georgia Tech's Course Critique
    if (university.toLowerCase().includes('georgia tech')) {
      await page.goto('https://critique.gatech.edu/');
      
      // If we have a specific course, search for it
      if (course) {
        // Extract course code if it's embedded in a longer string
        const courseCode = course.match(/([A-Z]{2,4})\s*(\d{4})/i);
        const searchTerm = courseCode ? `${courseCode[1]} ${courseCode[2]}` : course;
        
        console.log(`Searching Course Critique for: ${searchTerm}`);
        await page.fill('input[type="text"]', searchTerm);
        await page.press('input[type="text"]', 'Enter');
        await page.waitForTimeout(3000);
        
        // First, get all course sections with their average GPAs
        const courseSections = [];
        const sectionRows = await page.$$('.course-section-row');
        
        for (const row of sectionRows) {
          const sectionName = await row.evaluate(el => el.querySelector('.course-section-name')?.textContent || '');
          const sectionGPA = await row.evaluate(el => {
            const gpaEl = el.querySelector('.course-section-gpa');
            return gpaEl ? parseFloat(gpaEl.textContent || '0') : 0;
          });
          
          courseSections.push({
            name: sectionName,
            gpa: sectionGPA
          });
        }
        
        // Sort sections by GPA (highest first)
        courseSections.sort((a, b) => b.gpa - a.gpa);
        
        // Take top 3 sections with highest GPAs
        const topSections = courseSections.slice(0, 3);
        console.log(`Top sections by GPA: ${JSON.stringify(topSections)}`);
        
        // For each top section, click on it and get professor data
        for (const section of topSections) {
          // Click on the section to view professors
          const sectionElement = await page.$(`text=${section.name}`);
          if (sectionElement) {
            await sectionElement.click();
            await page.waitForTimeout(2000);
            
            // Extract professor data for this section
            const professorRows = await page.$$('.professor-row');
            
            const sectionProfessors = [];
            for (const row of professorRows) {
              const name = await row.evaluate(el => el.querySelector('.professor-name')?.textContent || '');
              const gpa = await row.evaluate(el => {
                const gpaEl = el.querySelector('.professor-gpa');
                return gpaEl ? parseFloat(gpaEl.textContent || '0') : undefined;
              });
              
              // Add number of ratings if available
              const numRatings = await row.evaluate(el => {
                const ratingsEl = el.querySelector('.professor-ratings-count');
                return ratingsEl ? parseInt(ratingsEl.textContent || '0') : undefined;
              });
              
              sectionProfessors.push({
                name,
                avgGPA: gpa,
                numRatings,
                section: section.name,
                course: course // Add course information
              });
            }
            
            // Sort professors by GPA (highest first)
            sectionProfessors.sort((a, b) => {
              if (a.avgGPA !== undefined && b.avgGPA !== undefined) {
                return b.avgGPA - a.avgGPA;
              }
              return 0;
            });
            
            // Add top professors from this section to results
            results.push(...sectionProfessors);
            
            // Go back to search results
            await page.goBack();
            await page.waitForTimeout(1500);
          }
        }
      } else {
        // If no specific course, search for courses by major
        // This would be used when we have major requirements but no specific course
        // Implementation would be similar but would search for each required course
      }
    } else {
      // Generic implementation for other universities
      console.log(`No specific implementation for university: ${university}`);
    }
  } catch (error) {
    console.error('Error scraping Course Critique:', error);
  } finally {
    await browser.close();
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
      
      // For each course, keep only the top professors by GPA
      const finalResults: ProfessorData[] = [];
      
      for (const [course, professors] of courseGroups.entries()) {
        // Sort by GPA
        professors.sort((a, b) => {
          if (a.avgGPA !== undefined && b.avgGPA !== undefined) {
            return b.avgGPA - a.avgGPA;
          }
          return 0;
        });
        
        // Take top 3 professors for each course
        finalResults.push(...professors.slice(0, 3));
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
 * Merge results from both sources, prioritizing professors with complete information
 */
/**
 * Merge results with priority on GPA for Georgia Tech
 */
function mergeResultsWithGPAPriority(rmpResults: ProfessorData[], courseEvalResults: ProfessorData[]): ProfessorData[] {
  const mergedMap = new Map<string, ProfessorData>();
  
  // Process Course Eval results first (priority)
  for (const prof of courseEvalResults) {
    mergedMap.set(prof.name.toLowerCase(), prof);
  }
  
  // Merge with RMP results (secondary)
  for (const prof of rmpResults) {
    const key = prof.name.toLowerCase();
    if (mergedMap.has(key)) {
      // Merge with existing entry, but preserve Course Critique GPA
      const existing = mergedMap.get(key)!;
      const merged = { ...prof, ...existing };
      
      // Ensure we keep the Course Critique GPA if it exists
      if (existing.avgGPA !== undefined) {
        merged.avgGPA = existing.avgGPA;
      }
      
      mergedMap.set(key, merged);
    } else {
      mergedMap.set(key, prof);
    }
  }
  
  // Convert map to array and sort primarily by GPA (highest first)
  return Array.from(mergedMap.values())
    .sort((a, b) => {
      // Sort by GPA first (Georgia Tech priority)
      if (a.avgGPA !== undefined && b.avgGPA !== undefined) {
        return b.avgGPA - a.avgGPA;
      }
      // Then by rating if GPAs are equal or undefined
      if (a.rating !== undefined && b.rating !== undefined) {
        return b.rating - a.rating;
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