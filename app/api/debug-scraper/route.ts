import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';

interface DebugLog {
  timestamp: string;
  action: string;
  data?: any;
  error?: string;
}

interface ProfessorDebugData {
  name: string;
  avgGPA: number;
  url: string;
  scrapedElements: {
    nameElement?: string;
    gpaElement?: string;
    ratingElement?: string;
    allText?: string;
  };
  errors?: string[];
}

interface CourseDebugData {
  courseCode: string;
  url: string;
  professors: ProfessorDebugData[];
  scrapingErrors: string[];
  pageContent?: string;
}

// Utility function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced delay function with randomization
const randomDelay = (min: number, max: number) => {
  const delay = Math.random() * (max - min) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
};

// Debug version of professor scraping with detailed logging
async function debugScrapeProfessorData(
  page: any, 
  courseCode: string, 
  university: string,
  logs: DebugLog[],
  simulateHumanBehavior?: () => Promise<void>
): Promise<CourseDebugData> {
  const courseDebugData: CourseDebugData = {
    courseCode,
    url: '',
    professors: [],
    scrapingErrors: []
  };

  try {
    // Navigate with human-like delay
    await randomDelay(1000, 3000);
    
    const searchUrl = `https://critique.gatech.edu/course?courseID=${encodeURIComponent(courseCode)}`;
    courseDebugData.url = searchUrl;
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: `Navigating to: ${searchUrl}`
    });

    const response = await page.goto(searchUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 // Increased timeout
    });

    // Check for blocking
    if (response?.status() === 403 || response?.status() === 429) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'Access blocked',
        error: `HTTP ${response.status()} - Site may be blocking automated requests`
      });
    }

    // Simulate human behavior after page load
    if (simulateHumanBehavior) {
      await simulateHumanBehavior();
    }

    // Wait for React app to load with multiple strategies
    try {
      // Strategy 1: Wait for specific content
      await page.waitForSelector('div.course-header, table.table-striped, .course-table, [data-testid="course-data"], .professor-card', { 
        timeout: 20000 
      });
    } catch (error) {
      // Strategy 2: Wait for any meaningful content
      try {
        await page.waitForFunction(
          () => {
            const bodyText = document.body.innerText;
            return bodyText.length > 100 && !bodyText.includes('Loading...');
          },
          { timeout: 15000 }
        );
      } catch (innerError) {
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Timeout waiting for content',
          error: 'Page may still be loading or blocked'
        });
      }
    }

    // Additional human-like delay
    await randomDelay(2000, 4000);

    // Simulate reading behavior
    if (simulateHumanBehavior) {
      await simulateHumanBehavior();
    }

    // Wait for page to load
    try {
      // Wait for either course headers or table content to appear (up to 15 seconds)
      await page.waitForSelector('div.course-header, table.table-striped, .course-table', { 
        timeout: 15000 
      });
      
      // Additional delay to ensure all content is rendered
      await delay(2000);
    } catch (error) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'Timeout waiting for course content to load',
        error: error.message
      });
      
      // Try waiting a bit more in case it's just slow
      await delay(5000);
    }

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Page loaded, looking for instructor table'
    });

    // Extract instructor data from the table
    const instructorData = await page.evaluate(() => {
      const results = [];
      
      // Enhanced debugging - let's see what's actually on the page
      const debugInfo = {
        courseHeadersFound: document.querySelectorAll('div.course-header').length,
        profLinksFound: document.querySelectorAll('a[href*="/prof"]').length,
        allLinksFound: document.querySelectorAll('a').length,
        tableRowsFound: document.querySelectorAll('tbody tr.course-table').length,
        bodyText: document.body.innerText.substring(0, 500),
        htmlSample: document.body.innerHTML.substring(0, 1000)
      };
      
      // Target the specific structure: tbody tr.course-table td div.course-header
      const courseHeaders = document.querySelectorAll('tbody tr.course-table td div.course-header');
      
      for (const header of courseHeaders) {
        // Get all text content from the course-header div
        const headerText = header.textContent?.trim();
        if (!headerText) continue;
        
        // Look for instructor links within this div
        const instructorLinks = header.querySelectorAll('a');
        
        for (const link of instructorLinks) {
          const instructorName = link.textContent?.trim();
          if (!instructorName || instructorName === '') continue;
          
          // Look for GPA in the same course-header div or parent row
          let gpa = null;
          
          // Method 1: Look in the course-header div text
          const gpaMatches = headerText.match(/(\d+\.\d{1,2})/g);
          if (gpaMatches) {
            for (const match of gpaMatches) {
              const value = parseFloat(match);
              if (value >= 0.0 && value <= 4.0) {
                gpa = value;
                break;
              }
            }
          }
          
          // Method 2: Look in the parent table row
          if (!gpa) {
            const parentRow = header.closest('tr');
            if (parentRow) {
              const rowText = parentRow.textContent || '';
              const rowGpaMatch = rowText.match(/(\d+\.\d{1,2})/g);
              if (rowGpaMatch) {
                for (const match of rowGpaMatch) {
                  const value = parseFloat(match);
                  if (value >= 0.0 && value <= 4.0) {
                    gpa = value;
                    break;
                  }
                }
              }
            }
          }
          
          results.push({
            name: instructorName,
            gpa: gpa,
            href: link.href || '',
            rowHTML: header.outerHTML,
            linkHTML: link.outerHTML
          });
        }
        
        // If no links found in this header, check if the header itself contains instructor name
        if (instructorLinks.length === 0 && headerText.length > 2) {
          // Look for patterns like "Last, First" or names with commas
          if (headerText.includes(',') || headerText.split(' ').length >= 2) {
            let gpa = null;
            const gpaMatches = headerText.match(/(\d+\.\d{1,2})/g);
            if (gpaMatches) {
              for (const match of gpaMatches) {
                const value = parseFloat(match);
                if (value >= 0.0 && value <= 4.0) {
                  gpa = value;
                  break;
                }
              }
            }
            
            results.push({
              name: headerText,
              gpa: gpa,
              href: '',
              rowHTML: header.outerHTML,
              linkHTML: header.outerHTML
            });
          }
        }
      }
      
      return {
        instructors: results,
        pageTitle: document.title,
        debugInfo: debugInfo,
        sampleHTML: document.querySelector('div.course-header')?.outerHTML || document.body.innerHTML.substring(0, 2000)
      };
    });

    logs.push({
      timestamp: new Date().toISOString(),
      action: `Found ${instructorData.instructors.length} instructors`,
      data: { 
        instructors: instructorData.instructors.map(i => ({ name: i.name, gpa: i.gpa })),
        pageTitle: instructorData.pageTitle,
        debugInfo: instructorData.debugInfo,
        sampleHTML: instructorData.sampleHTML
      }
    });

    // Process the extracted data
    for (const instructor of instructorData.instructors) {
      const professorDebugData: ProfessorDebugData = {
        name: instructor.name,
        avgGPA: instructor.gpa || 0,
        url: instructor.href,
        scrapedElements: {
          nameElement: instructor.name,
          gpaElement: instructor.gpa?.toString() || 'Not found',
          allText: instructor.rowHTML
        }
      };

      courseDebugData.professors.push(professorDebugData);
    }

    // Format output as requested: "CS1301: Phillips,Charles 3.37; Southern,Caleb 3.35"
    const formattedOutput = courseDebugData.professors
      .map(prof => `${prof.name} ${prof.avgGPA}`)
      .join('; ');
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Formatted instructor data',
      data: { 
        formatted: `${courseCode}: ${formattedOutput}`,
        rawData: courseDebugData.professors
      }
    });

    // Store the formatted output in pageContent for easy access
    courseDebugData.pageContent = `${courseCode}: ${formattedOutput}`;

  } catch (error) {
    const errorMsg = `Error scraping course ${courseCode}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    courseDebugData.scrapingErrors.push(errorMsg);
    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Error in course scraping',
      error: errorMsg
    });
  }

  return courseDebugData;
}

export async function POST(request: NextRequest) {
  const logs: DebugLog[] = [];
  let browser;

  try {
    const requestBody = await request.json();
    const { query, university, courses, course } = requestBody;

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Starting debug scraping session',
      data: { query, university, courses, course, requestBody }
    });

    // Launch browser with stealth settings (non-headless for better detection avoidance)
    browser = await chromium.launch({
      headless: false, // Run with visible window to avoid headless detection
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor',
        '--disable-web-security',
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu'
      ]
    });

    // Create context with realistic browser fingerprint
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1366, height: 768 }, // Common screen resolution
      locale: 'en-US',
      timezoneId: 'America/New_York',
      permissions: ['geolocation'],
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"macOS"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Create page and add stealth scripts
    const page = await context.newPage();
    
    // Remove webdriver property to avoid detection
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Add realistic mouse movements and scrolling
    const simulateHumanBehavior = async () => {
      // Random mouse movement
      await page.mouse.move(
        Math.random() * 1366,
        Math.random() * 768
      );
      
      // Random scroll
      await page.evaluate(() => {
        window.scrollBy(0, Math.random() * 200);
      });
      
      // Random delay between actions
      await randomDelay(500, 2000);
    };

    // Extract courses from multiple possible sources
    let coursesToScrape = courses || [];
    
    // If single course provided, add it to array
    if (course && !coursesToScrape.includes(course)) {
      coursesToScrape.push(course);
    }
    
    // If no courses provided but query exists, extract from query
    if (coursesToScrape.length === 0 && query) {
      const courseRegex = /\b[A-Z]{2,4}\s*\d{4}\b/g;
      const extractedCourses = query.match(courseRegex) || [];
      coursesToScrape = extractedCourses;
    }

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Extracted courses to scrape',
      data: { coursesToScrape, originalCourse: course, originalCourses: courses, originalQuery: query }
    });

    const debugResults: CourseDebugData[] = [];

    // Scrape each course
    for (const courseCode of coursesToScrape) {
      // Add random delay between courses
      await randomDelay(2000, 5000);
      
      const courseDebugData = await debugScrapeProfessorData(page, courseCode, university, logs, simulateHumanBehavior);
      debugResults.push(courseDebugData);
      
      // Simulate human reading time
      await randomDelay(3000, 7000);
    }

    // If no specific courses, try a general search
    if (coursesToScrape.length === 0) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'No specific courses found, performing general Course Critique exploration'
      });

      try {
        await page.goto('https://critique.gatech.edu/', { 
          waitUntil: 'networkidle',
          timeout: 30000 
        });

        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            url: window.location.href,
            bodyText: document.body.innerText.substring(0, 2000),
            linkCount: document.querySelectorAll('a').length,
            courseLinks: Array.from(document.querySelectorAll('a[href*="/course/"]')).length
          };
        });

        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Explored Course Critique main page',
          data: pageInfo
        });

      } catch (error) {
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Error exploring Course Critique',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      professorData: debugResults,
      scrapingLogs: logs.map(log => `[${log.timestamp}] ${log.action}${log.error ? ` - ERROR: ${log.error}` : ''}${log.data ? ` - DATA: ${JSON.stringify(log.data)}` : ''}`),
      rawData: {
        query,
        university,
        coursesToScrape,
        totalCoursesScraped: debugResults.length,
        totalProfessorsFound: debugResults.reduce((sum, course) => sum + course.professors.length, 0),
        debugResults
      }
    });

  } catch (error) {
    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Fatal error in debug scraping',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      scrapingLogs: logs.map(log => `[${log.timestamp}] ${log.action}${log.error ? ` - ERROR: ${log.error}` : ''}`)
    }, { status: 500 });

  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Enhanced debugScrapeProfessorData function
async function debugScrapeProfessorData(
  page: any, 
  courseCode: string, 
  university: string,
  logs: DebugLog[],
  simulateHumanBehavior?: () => Promise<void>
): Promise<CourseDebugData> {
  const courseDebugData: CourseDebugData = {
    courseCode,
    url: '',
    professors: [],
    scrapingErrors: []
  };

  try {
    logs.push({
      timestamp: new Date().toISOString(),
      action: `Starting debug scrape for course: ${courseCode} at ${university}`
    });

    // Navigate to Course Critique
    const searchUrl = `https://critique.gatech.edu/course?courseID=${encodeURIComponent(courseCode)}`;
    courseDebugData.url = searchUrl;
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: `Navigating to: ${searchUrl}`
    });

    // Navigate with human-like delay
    await randomDelay(1000, 3000);
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: `Navigating to: ${searchUrl}`
    });

    const response = await page.goto(searchUrl, { 
      waitUntil: 'networkidle',
      timeout: 45000 // Increased timeout
    });

    // Check for blocking
    if (response?.status() === 403 || response?.status() === 429) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'Access blocked',
        error: `HTTP ${response.status()} - Site may be blocking automated requests`
      });
    }

    // Simulate human behavior after page load
    if (simulateHumanBehavior) {
      await simulateHumanBehavior();
    }

    // Wait for React app to load with multiple strategies
    try {
      // Strategy 1: Wait for specific content
      await page.waitForSelector('div.course-header, table.table-striped, .course-table, [data-testid="course-data"], .professor-card', { 
        timeout: 20000 
      });
    } catch (error) {
      // Strategy 2: Wait for any meaningful content
      try {
        await page.waitForFunction(
          () => {
            const bodyText = document.body.innerText;
            return bodyText.length > 100 && !bodyText.includes('Loading...');
          },
          { timeout: 15000 }
        );
      } catch (innerError) {
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Timeout waiting for content',
          error: 'Page may still be loading or blocked'
        });
      }
    }

    // Additional human-like delay
    await randomDelay(2000, 4000);

    // Simulate reading behavior
    if (simulateHumanBehavior) {
      await simulateHumanBehavior();
    }

    // Wait for page to load
    try {
      // Wait for either course headers or table content to appear (up to 15 seconds)
      await page.waitForSelector('div.course-header, table.table-striped, .course-table', { 
        timeout: 15000 
      });
      
      // Additional delay to ensure all content is rendered
      await delay(2000);
    } catch (error) {
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'Timeout waiting for course content to load',
        error: error.message
      });
      
      // Try waiting a bit more in case it's just slow
      await delay(5000);
    }

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Page loaded, looking for instructor table'
    });

    // Extract instructor data from the table
    const instructorData = await page.evaluate(() => {
      const results = [];
      
      // Enhanced debugging - let's see what's actually on the page
      const debugInfo = {
        courseHeadersFound: document.querySelectorAll('div.course-header').length,
        profLinksFound: document.querySelectorAll('a[href*="/prof"]').length,
        allLinksFound: document.querySelectorAll('a').length,
        tableRowsFound: document.querySelectorAll('tbody tr.course-table').length,
        bodyText: document.body.innerText.substring(0, 500),
        htmlSample: document.body.innerHTML.substring(0, 1000)
      };
      
      // Target the specific structure: tbody tr.course-table td div.course-header
      const courseHeaders = document.querySelectorAll('tbody tr.course-table td div.course-header');
      
      for (const header of courseHeaders) {
        // Get all text content from the course-header div
        const headerText = header.textContent?.trim();
        if (!headerText) continue;
        
        // Look for instructor links within this div
        const instructorLinks = header.querySelectorAll('a');
        
        for (const link of instructorLinks) {
          const instructorName = link.textContent?.trim();
          if (!instructorName || instructorName === '') continue;
          
          // Look for GPA in the same course-header div or parent row
          let gpa = null;
          
          // Method 1: Look in the course-header div text
          const gpaMatches = headerText.match(/(\d+\.\d{1,2})/g);
          if (gpaMatches) {
            for (const match of gpaMatches) {
              const value = parseFloat(match);
              if (value >= 0.0 && value <= 4.0) {
                gpa = value;
                break;
              }
            }
          }
          
          // Method 2: Look in the parent table row
          if (!gpa) {
            const parentRow = header.closest('tr');
            if (parentRow) {
              const rowText = parentRow.textContent || '';
              const rowGpaMatch = rowText.match(/(\d+\.\d{1,2})/g);
              if (rowGpaMatch) {
                for (const match of rowGpaMatch) {
                  const value = parseFloat(match);
                  if (value >= 0.0 && value <= 4.0) {
                    gpa = value;
                    break;
                  }
                }
              }
            }
          }
          
          results.push({
            name: instructorName,
            gpa: gpa,
            href: link.href || '',
            rowHTML: header.outerHTML,
            linkHTML: link.outerHTML
          });
        }
        
        // If no links found in this header, check if the header itself contains instructor name
        if (instructorLinks.length === 0 && headerText.length > 2) {
          // Look for patterns like "Last, First" or names with commas
          if (headerText.includes(',') || headerText.split(' ').length >= 2) {
            let gpa = null;
            const gpaMatches = headerText.match(/(\d+\.\d{1,2})/g);
            if (gpaMatches) {
              for (const match of gpaMatches) {
                const value = parseFloat(match);
                if (value >= 0.0 && value <= 4.0) {
                  gpa = value;
                  break;
                }
              }
            }
            
            results.push({
              name: headerText,
              gpa: gpa,
              href: '',
              rowHTML: header.outerHTML,
              linkHTML: header.outerHTML
            });
          }
        }
      }
      
      return {
        instructors: results,
        pageTitle: document.title,
        debugInfo: debugInfo,
        sampleHTML: document.querySelector('div.course-header')?.outerHTML || document.body.innerHTML.substring(0, 2000)
      };
    });

    logs.push({
      timestamp: new Date().toISOString(),
      action: `Found ${instructorData.instructors.length} instructors`,
      data: { 
        instructors: instructorData.instructors.map(i => ({ name: i.name, gpa: i.gpa })),
        pageTitle: instructorData.pageTitle,
        debugInfo: instructorData.debugInfo,
        sampleHTML: instructorData.sampleHTML
      }
    });

    // Process the extracted data
    for (const instructor of instructorData.instructors) {
      const professorDebugData: ProfessorDebugData = {
        name: instructor.name,
        avgGPA: instructor.gpa || 0,
        url: instructor.href,
        scrapedElements: {
          nameElement: instructor.name,
          gpaElement: instructor.gpa?.toString() || 'Not found',
          allText: instructor.rowHTML
        }
      };

      courseDebugData.professors.push(professorDebugData);
    }

    // Format output as requested: "CS1301: Phillips,Charles 3.37; Southern,Caleb 3.35"
    const formattedOutput = courseDebugData.professors
      .map(prof => `${prof.name} ${prof.avgGPA}`)
      .join('; ');
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Formatted instructor data',
      data: { 
        formatted: `${courseCode}: ${formattedOutput}`,
        rawData: courseDebugData.professors
      }
    });

    // Store the formatted output in pageContent for easy access
    courseDebugData.pageContent = `${courseCode}: ${formattedOutput}`;

  } catch (error) {
    const errorMsg = `Error scraping course ${courseCode}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    courseDebugData.scrapingErrors.push(errorMsg);
    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Error in course scraping',
      error: errorMsg
    });
  }

  return courseDebugData;
}

