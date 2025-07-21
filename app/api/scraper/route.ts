import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

// Interface for professor data
interface ProfessorData {
  name: string;
  avgGPA: number;
  course: string;
  rating?: number; // RMP rating (only used as tiebreaker)
}

// Interface for graduation planning data
interface GraduationPlanData {
  currentYear: string; // 'freshman', 'sophomore', 'junior', or 'senior'
  semestersRemaining: number;
  expectedGraduationYear: number;
}

/**
 * Calculate semesters remaining based on student's current year
 */
function calculateSemestersRemaining(currentYear: string): GraduationPlanData {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-11 (Jan-Dec)
  const currentCalendarYear = currentDate.getFullYear();
  
  // Determine if we're in fall or spring semester
  // Assuming Fall semester: August-December, Spring semester: January-May
  const isCurrentlyFallSemester = currentMonth >= 7; // August or later
  
  // Map student year to total semesters in a 4-year program
  let semestersCompleted = 0;
  
  switch (currentYear.toLowerCase()) {
    case 'freshman':
      // Freshman: 0 semesters completed at start of fall, 1 at start of spring
      semestersCompleted = isCurrentlyFallSemester ? 0 : 1;
      break;
    case 'sophomore':
      // Sophomore: 2 semesters completed at start of fall, 3 at start of spring
      semestersCompleted = isCurrentlyFallSemester ? 2 : 3;
      break;
    case 'junior':
      // Junior: 4 semesters completed at start of fall, 5 at start of spring
      semestersCompleted = isCurrentlyFallSemester ? 4 : 5;
      break;
    case 'senior':
      // Senior: 6 semesters completed at start of fall, 7 at start of spring
      semestersCompleted = isCurrentlyFallSemester ? 6 : 7;
      break;
    default:
      // Default to freshman if invalid input
      semestersCompleted = isCurrentlyFallSemester ? 0 : 1;
  }
  
  // Total semesters in a 4-year program (8 semesters)
  const totalSemesters = 8;
  
  // Calculate remaining semesters
  const semestersRemaining = Math.max(0, totalSemesters - semestersCompleted);
  
  // Calculate expected graduation year
  // Each academic year has 2 semesters
  const yearsRemaining = Math.ceil(semestersRemaining / 2);
  const expectedGraduationYear = currentCalendarYear + yearsRemaining;
  
  return {
    currentYear: currentYear.toLowerCase(),
    semestersRemaining,
    expectedGraduationYear
  };
}

/**
 * Get professors for a course from Course Critique
 */
async function getCourseCritiqueProfessors(course: string): Promise<ProfessorData[]> {
  try {
    // Extract course code if it's embedded in a longer string
    const courseCode = course.match(/([A-Z]{2,4})\s*(\d{4})/i);
    const searchTerm = courseCode ? `${courseCode[1]} ${courseCode[2]}` : course;
    
    console.log(`Searching Course Critique for: ${searchTerm}`);
    
    // Launch browser for direct scraping
    const browser = await chromium.launch({ headless: true });
    
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      
      // Navigate to Course Critique course page
      await page.goto(`https://critique.gatech.edu/course/${searchTerm}`);
      await page.waitForTimeout(3000); // Increased wait time to ensure page loads fully
      
      // Log the current URL to verify we're on the right page
      console.log(`Current page: ${page.url()}`);
      
      // Take a screenshot for debugging (optional)
      await page.screenshot({ path: 'course-critique-debug.png' });
      
      // Extract professor data from the page
      const professorData: ProfessorData[] = [];
      
      // Find all elements containing professor links with profID
      const profLinks = await page.$$('a[href^="/prof?profID="]');
      console.log(`Found ${profLinks.length} professor links on Course Critique`);
      
      // Process each professor link
      for (let i = 0; i < profLinks.length; i++) {
        const link = profLinks[i];
        
        // Extract professor name from the href attribute
        let name = '';
        try {
          const href = await link.getAttribute('href') || '';
          const profIDMatch = href.match(/\/prof\?profID=(.+)/);
          
          if (profIDMatch && profIDMatch[1]) {
            name = decodeURIComponent(profIDMatch[1]);
            name = name.trim();
            console.log(`Found professor from profID: ${name}`);
          } else {
            console.log(`No profID found in href: ${href}`);
          }
        } catch (nameError) {
          console.error(`Error extracting professor name from link ${i+1}:`, nameError);
        }
        
        // Find the closest professor row to get the GPA
        let gpa = 0;
        try {
          // Navigate up to find the professor row containing this link
          const row = await link.evaluateHandle(el => {
            let current = el;
            while (current && !current.classList.contains('professor-row')) {
              current = current.parentElement;
            }
            return current;
          });
          
          // Extract GPA from the row
          if (row) {
            const gpaElement = await row.evaluateHandle(el => el.querySelector('p.standard-data'));
            
            if (gpaElement) {
              const gpaText = await gpaElement.evaluate(el => el.textContent || '');
              console.log(`GPA text for ${name}: ${gpaText}`);
              
              // Extract numeric GPA value from text
              const gpaMatch = gpaText.match(/(\d+\.\d+)/);
              if (gpaMatch) {
                gpa = parseFloat(gpaMatch[1]);
                console.log(`Extracted GPA for ${name}: ${gpa}`);
              } else {
                console.log(`Could not extract GPA from text: ${gpaText}`);
              }
            } else {
              console.log(`No GPA element found for professor ${name}`);
            }
          } else {
            console.log(`Could not find professor row for ${name}`);
          }
        } catch (gpaError) {
          console.error(`Error extracting GPA for professor ${name}:`, gpaError);
        }
        
        // Add to professor data array if we have a valid name and GPA
        if (name && gpa > 0) {
          professorData.push({
            name,
            avgGPA: gpa,
            course: searchTerm
          });
          console.log(`Added professor ${name} with GPA ${gpa} to results`);
        } else {
          console.log(`Skipping professor ${name || 'unknown'} due to missing data`);
        }
      }
      
      // Log the final results
      console.log(`Total professors found with valid data: ${professorData.length}`);
      professorData.forEach(prof => {
        console.log(`- ${prof.name}: GPA ${prof.avgGPA}`);
      });
      
      // Step 2: Filter the teachers GPA from highest to low
      return professorData.sort((a, b) => b.avgGPA - a.avgGPA);
      
    } catch (error) {
      console.error('Error scraping Course Critique website:', error);
      return [];
    } finally {
      await browser.close();
    }
  } catch (error) {
    console.error('Error in getCourseCritiqueProfessors:', error);
    return [];
  }
}

/**
 * Get professor rating from Rate My Professor (only used as tiebreaker)
 */
async function getRateMyProfessorRating(university: string, professorName: string): Promise<number | undefined> {
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to Rate My Professor search page
    await page.goto('https://www.ratemyprofessors.com/');
    
    // Search for the university
    await page.fill('input[placeholder="Your school"]', university);
    await page.waitForTimeout(1500);
    
    // Click on the first university result
    const schoolResults = await page.$$('.SearchResultsPage__StyledSearchResultsPage-sc-1srop1v-0');
    if (schoolResults.length > 0) {
      await schoolResults[0].click();
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      
      // Search for the professor
      await page.fill('input[placeholder="Search for your professor"]', professorName);
      await page.press('input[placeholder="Search for your professor"]', 'Enter');
      await page.waitForTimeout(2500);
      
      // Extract professor rating from search results
      const professorCards = await page.$$('.TeacherCard__StyledTeacherCard-syjs0d-0');
      
      for (const card of professorCards) {
        const name = await card.evaluate(el => el.querySelector('.CardName__StyledCardName-sc-1gyrgim-0')?.textContent || '');
        
        // Check if this is the professor we're looking for
        if (name.toLowerCase().includes(professorName.toLowerCase())) {
          const rating = await card.evaluate(el => {
            const ratingEl = el.querySelector('.CardNumRating__CardNumRatingNumber-sc-17t4b9u-2');
            return ratingEl ? parseFloat(ratingEl.textContent || '0') : undefined;
          });
          
          console.log(`Found RMP rating for ${professorName}: ${rating}`);
          return rating;
        }
      }
      
      console.log(`No RMP rating found for ${professorName}`);
    }
    
    return undefined;
  } catch (error) {
    console.error('Error getting Rate My Professor rating:', error);
    return undefined;
  } finally {
    await browser.close();
  }
}

/**
 * API route handler for getting the highest GPA professor for a course
 * and calculating graduation timeline
 */
export async function POST(request: NextRequest) {
  try {
    const { course, studentYear } = await request.json();
    
    if (!course) {
      return NextResponse.json({ error: 'Course code is required' }, { status: 400 });
    }
    
    console.log(`Processing request for course: ${course}`);
    
    // Calculate graduation timeline if student year is provided
    let graduationPlan: GraduationPlanData | undefined;
    if (studentYear) {
      graduationPlan = calculateSemestersRemaining(studentYear);
      console.log(`Student is a ${studentYear}. Semesters remaining: ${graduationPlan.semestersRemaining}`);
    }
    
    // Step 1: Get professors from Course Critique
    const professors = await getCourseCritiqueProfessors(course);
    
    if (professors.length === 0) {
      console.log('No professors found for this course');
      return NextResponse.json({
        error: 'No professors found for this course on Course Critique',
        graduationPlan
      }, { status: 404 });
    }
    
    console.log(`Found ${professors.length} professors for ${course}`);
    
    // Step 2: Find the highest GPA
    const highestGPA = professors[0].avgGPA;
    console.log(`Highest GPA: ${highestGPA}`);
    
    // Step 3: Find all professors with the highest GPA
    const topProfessors = professors.filter(prof => prof.avgGPA === highestGPA);
    console.log(`${topProfessors.length} professors have the highest GPA of ${highestGPA}`);
    
    // If only one professor has the highest GPA, return them
    if (topProfessors.length === 1) {
      console.log(`Returning single top professor: ${topProfessors[0].name}`);
      return NextResponse.json({
        professor: topProfessors[0],
        graduationPlan
      });
    }
    
    // Step 4: If multiple professors have the same GPA, use Rate My Professor as tiebreaker
    console.log('Multiple professors with same GPA, using RMP as tiebreaker');
    const university = 'Georgia Tech';
    
    // Get RMP ratings for all top professors
    for (const prof of topProfessors) {
      prof.rating = await getRateMyProfessorRating(university, prof.name);
      console.log(`RMP rating for ${prof.name}: ${prof.rating || 'not found'}`);
    }
    
    // Sort by RMP rating (highest first)
    topProfessors.sort((a, b) => {
      // If both have ratings, compare them
      if (a.rating !== undefined && b.rating !== undefined) {
        return b.rating - a.rating;
      }
      // If only one has a rating, prioritize that one
      if (a.rating !== undefined) return -1;
      if (b.rating !== undefined) return 1;
      // If neither has a rating, keep original order
      return 0;
    });
    
    console.log(`After tiebreaker, top professor is: ${topProfessors[0].name}`);
    
    return NextResponse.json({
      professor: topProfessors[0],
      graduationPlan,
      note: topProfessors.length > 1 ? 'Multiple professors had the same highest GPA. Used Rate My Professor rating as tiebreaker.' : undefined
    });
    
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Failed to get professor information' },
      { status: 500 }
    );
  }
}