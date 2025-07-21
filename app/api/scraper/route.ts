import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

// Interface for professor data - simplified to only include GPA
interface ProfessorData {
  name: string;
  avgGPA: number;
  course: string;
}

// Interface for graduation planning data
interface GraduationPlanData {
  currentYear: string; // 'freshman', 'sophomore', 'junior', or 'senior'
  semestersRemaining: number;
  expectedGraduationYear: number;
  semesterPlan: Array<{term: string; year: number}>;
}

// Cache for professor data to avoid redundant scraping
const professorCache = new Map<string, ProfessorData[]>();

/**
 * Calculate semesters remaining based on student's current year
 * Supports up to 12 semesters including summer terms
 */
function calculateSemestersRemaining(currentYear: string): GraduationPlanData {
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-11 (Jan-Dec)
  const currentCalendarYear = currentDate.getFullYear();
  
  // Determine current term (Fall: Aug-Dec, Spring: Jan-Apr, Summer: May-Jul)
  let currentTerm: string;
  if (currentMonth >= 0 && currentMonth <= 3) {
    currentTerm = 'Spring';
  } else if (currentMonth >= 4 && currentMonth <= 6) {
    currentTerm = 'Summer';
  } else {
    currentTerm = 'Fall';
  }
  
  // Map student year to completed semesters, now including summer terms
  let semestersCompleted = 0;
  
  switch (currentYear.toLowerCase()) {
    case 'freshman':
      // Freshman year mapping
      if (currentTerm === 'Fall') semestersCompleted = 0;
      else if (currentTerm === 'Spring') semestersCompleted = 1;
      else semestersCompleted = 2; // Summer
      break;
    case 'sophomore':
      // Sophomore year mapping
      if (currentTerm === 'Fall') semestersCompleted = 3;
      else if (currentTerm === 'Spring') semestersCompleted = 4;
      else semestersCompleted = 5; // Summer
      break;
    case 'junior':
      // Junior year mapping
      if (currentTerm === 'Fall') semestersCompleted = 6;
      else if (currentTerm === 'Spring') semestersCompleted = 7;
      else semestersCompleted = 8; // Summer
      break;
    case 'senior':
      // Senior year mapping
      if (currentTerm === 'Fall') semestersCompleted = 9;
      else if (currentTerm === 'Spring') semestersCompleted = 10;
      else semestersCompleted = 11; // Summer
      break;
    default:
      // Default to freshman fall if invalid input
      semestersCompleted = 0;
  }
  
  // Maximum number of semesters to plan for (4 years × 3 terms = 12 semesters)
  const maxSemesters = 12;
  
  // Calculate remaining semesters (up to the maximum)
  const semestersRemaining = Math.min(maxSemesters, Math.max(0, maxSemesters - semestersCompleted));
  
  // Generate semester plan
  const semesterPlan: Array<{term: string; year: number}> = [];
  let termIndex = 0;
  let yearOffset = 0;
  
  // Determine starting term index (0=Fall, 1=Spring, 2=Summer)
  if (currentTerm === 'Fall') termIndex = 0;
  else if (currentTerm === 'Spring') termIndex = 1;
  else termIndex = 2; // Summer
  
  // Adjust for completed terms
  termIndex = (termIndex + 1) % 3; // Move to next term
  
  // Generate future semesters
  for (let i = 0; i < semestersRemaining; i++) {
    // Calculate year offset (each time we pass summer, increment year)
    if (termIndex === 0 && i > 0) yearOffset++;
    
    // Map index to term name
    let termName: string;
    if (termIndex === 0) termName = 'Fall';
    else if (termIndex === 1) termName = 'Spring';
    else termName = 'Summer';
    
    // Add to plan
    semesterPlan.push({
      term: termName,
      year: currentCalendarYear + yearOffset
    });
    
    // Move to next term
    termIndex = (termIndex + 1) % 3;
  }
  
  // Calculate expected graduation year based on the last semester in the plan
  const expectedGraduationYear = semesterPlan.length > 0 
    ? semesterPlan[semesterPlan.length - 1].year 
    : currentCalendarYear;
  
  return {
    currentYear: currentYear.toLowerCase(),
    semestersRemaining,
    expectedGraduationYear,
    semesterPlan
  };
}

/**
 * Helper function to retry a function with exponential backoff
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
    }
  }
  
  throw lastError;
}

/**
 * Extract professor GPA data from Course Critique
 */
async function extractProfessorData(
  page: any,
  profInfo: { name: string; href: string },
  course: string
): Promise<ProfessorData | null> {
  try {
    // Navigate directly to professor page
    await fetchWithRetry(
      () => page.goto(`https://critique.gatech.edu${profInfo.href}`, { timeout: 30000 }),
      3,
      1000
    );
    
    // Use page.evaluate for more efficient data extraction - ONLY GPA
    const gpa = await page.evaluate(() => {
      // Look for GPA in various possible elements
      const gpaElements = [
        ...Array.from(document.querySelectorAll('.professor-gpa-value')),
        ...Array.from(document.querySelectorAll('.standard-data')),
        ...Array.from(document.querySelectorAll('[data-testid="gpa-value"]'))
      ];
      
      for (const element of gpaElements) {
        const text = element.textContent || '';
        const match = text.match(/([0-9]\.[0-9]+)/);
        if (match) {
          return parseFloat(match[1]);
        }
      }
      
      return 0;
    });
    
    if (gpa > 0) {
      return {
        name: profInfo.name,
        avgGPA: gpa,
        course
      };
    }
    
    return null;
  } catch (error) {
    console.error(`Error extracting data for professor ${profInfo.name}:`, error);
    return null;
  }
}

/**
 * Get professors for a course from Course Critique with optimized parallel processing
 * ONLY gets GPA data from Course Critique
 */
async function getCourseCritiqueProfessors(course: string): Promise<ProfessorData[]> {
  // Check cache first
  const cacheKey = course.toUpperCase().replace(/\s+/g, '');
  if (professorCache.has(cacheKey)) {
    console.log(`Using cached data for ${course}`);
    return professorCache.get(cacheKey) || [];
  }
  
  console.log(`Searching Course Critique for: ${course}`);
  
  // Launch browser with more efficient settings
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--disable-dev-shm-usage', '--disable-setuid-sandbox', '--no-sandbox']
  });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    // Extract course code if it's embedded in a longer string
    const courseCode = course.match(/([A-Z]{2,4})\s*(\d{4})/i);
    const searchTerm = courseCode ? `${courseCode[1]} ${courseCode[2]}` : course;
    
    const page = await context.newPage();
    
    // Use the direct URL format with courseID parameter
    const encodedCourseID = encodeURIComponent(searchTerm);
    await fetchWithRetry(
      () => page.goto(`https://critique.gatech.edu/course?courseID=${encodedCourseID}`, { timeout: 30000 }),
      3,
      1000
    );
    
    // Wait for content to load with a more specific selector
    await page.waitForSelector('a[href^="/prof?profID="]', { timeout: 10000 })
      .catch(() => console.log('Timeout waiting for professor links, proceeding anyway'));
    
    // Extract all professor links at once
    const professorLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href^="/prof?profID="]'));
      return links.map(link => ({
        name: link.textContent?.trim() || '',
        href: link.getAttribute('href') || ''
      }));
    });
    
    console.log(`Found ${professorLinks.length} professor links on Course Critique`);
    
    if (professorLinks.length === 0) {
      return [];
    }
    
    // Create a pool of pages for parallel processing
    const pagePool = [];
    const maxPages = 5; // Adjust based on system resources
    
    for (let i = 0; i < maxPages; i++) {
      pagePool.push(await context.newPage());
    }
    
    // Process professors in batches
    const batchSize = pagePool.length;
    const professorData: ProfessorData[] = [];
    
    for (let i = 0; i < professorLinks.length; i += batchSize) {
      const batch = professorLinks.slice(i, i + batchSize);
      
      // Process batch in parallel using page pool
      const batchPromises = batch.map((prof, index) => 
        extractProfessorData(pagePool[index % pagePool.length], prof, searchTerm)
      );
      
      const batchResults = await Promise.all(batchPromises);
      
      // Filter out null results and add to final array
      const validResults = batchResults.filter(result => result !== null) as ProfessorData[];
      professorData.push(...validResults);
      
      // Add a small delay between batches to avoid rate limiting
      if (i + batchSize < professorLinks.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Close all pages in the pool
    await Promise.all(pagePool.map(p => p.close()));
    
    // Sort by GPA (highest first)
    const sortedData = professorData.sort((a, b) => b.avgGPA - a.avgGPA);
    
    // Cache the results
    professorCache.set(cacheKey, sortedData);
    
    console.log(`Total professors found with valid data: ${sortedData.length}`);
    return sortedData;
  } catch (error) {
    console.error('Error in getCourseCritiqueProfessors:', error);
    return [];
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
      console.log(`Semester plan: ${JSON.stringify(graduationPlan.semesterPlan)}`);
    }
    
    // Get professors from Course Critique - ONLY source of data
    const professors = await getCourseCritiqueProfessors(course);
    
    if (professors.length === 0) {
      console.log('No professors found for this course');
      return NextResponse.json({
        error: 'No professors found for this course on Course Critique',
        graduationPlan
      }, { status: 404 });
    }
    
    console.log(`Found ${professors.length} professors for ${course}`);
    
    // Return the professor with the highest GPA
    return NextResponse.json({
      professor: professors[0], // Already sorted by GPA (highest first)
      allProfessors: professors, // Return all professors for reference
      graduationPlan
    });
    
  } catch (error) {
    console.error('Error in API route:', error);
    return NextResponse.json(
      { error: 'Failed to get professor information' },
      { status: 500 }
    );
  }
}