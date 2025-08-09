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

// Debug version of professor scraping with detailed logging
async function debugScrapeProfessorData(
  page: any, 
  courseCode: string, 
  university: string,
  logs: DebugLog[]
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
    const searchUrl = `https://critique.gatech.edu/course/${courseCode.replace(' ', '')}`;
    courseDebugData.url = searchUrl;
    
    logs.push({
      timestamp: new Date().toISOString(),
      action: `Navigating to: ${searchUrl}`
    });

    await page.goto(searchUrl, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    // Wait for page to load
    await delay(2000);

    // Get page content for debugging
    const pageContent = await page.content();
    courseDebugData.pageContent = pageContent.substring(0, 5000); // First 5000 chars

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Page loaded, extracting professor information',
      data: { pageLength: pageContent.length }
    });

    // Try multiple selectors to find professor information
    const professorSelectors = [
      'a[href*="/instructor/"]',
      '.instructor-link',
      '.professor-link',
      '[data-testid="instructor-link"]',
      'a[href*="instructor"]',
      '.instructor',
      '.professor'
    ];

    let professorElements = [];
    
    for (const selector of professorSelectors) {
      try {
        const elements = await page.$$(selector);
        if (elements.length > 0) {
          professorElements = elements;
          logs.push({
            timestamp: new Date().toISOString(),
            action: `Found ${elements.length} professor elements with selector: ${selector}`
          });
          break;
        }
      } catch (error) {
        logs.push({
          timestamp: new Date().toISOString(),
          action: `Selector failed: ${selector}`,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    if (professorElements.length === 0) {
      // Try to find any links or text that might contain professor names
      const allLinks = await page.$$('a');
      const allText = await page.evaluate(() => document.body.innerText);
      
      logs.push({
        timestamp: new Date().toISOString(),
        action: 'No professor elements found with standard selectors',
        data: { 
          totalLinks: allLinks.length,
          pageTextPreview: allText.substring(0, 1000)
        }
      });

      courseDebugData.scrapingErrors.push('No professor elements found with any selector');
      return courseDebugData;
    }

    // Extract professor data from each element
    for (let i = 0; i < professorElements.length; i++) {
      const element = professorElements[i];
      
      try {
        const professorData = await page.evaluate((el: any) => {
          const name = el.textContent?.trim() || el.innerText?.trim() || '';
          const href = el.href || '';
          
          // Try to find GPA information nearby
          let gpaText = '';
          let ratingText = '';
          
          // Look for GPA in parent elements
          let parent = el.parentElement;
          for (let j = 0; j < 3 && parent; j++) {
            const parentText = parent.textContent || '';
            const gpaMatch = parentText.match(/(\d+\.?\d*)\s*GPA/i);
            const ratingMatch = parentText.match(/(\d+\.?\d*)\s*(rating|stars?)/i);
            
            if (gpaMatch) gpaText = gpaMatch[1];
            if (ratingMatch) ratingText = ratingMatch[1];
            
            parent = parent.parentElement;
          }
          
          // Look for GPA in sibling elements
          if (!gpaText) {
            const siblings = Array.from(el.parentElement?.children || []);
            siblings.forEach((sibling: any) => {
              const siblingText = sibling.textContent || '';
              const gpaMatch = siblingText.match(/(\d+\.?\d*)\s*GPA/i);
              if (gpaMatch) gpaText = gpaMatch[1];
            });
          }
          
          return {
            name,
            href,
            gpaText,
            ratingText,
            elementHTML: el.outerHTML,
            parentHTML: el.parentElement?.outerHTML || ''
          };
        }, element);

        const professorDebugData: ProfessorDebugData = {
          name: professorData.name,
          avgGPA: professorData.gpaText ? parseFloat(professorData.gpaText) : 0,
          url: professorData.href,
          scrapedElements: {
            nameElement: professorData.name,
            gpaElement: professorData.gpaText,
            ratingElement: professorData.ratingText,
            allText: professorData.elementHTML
          }
        };

        // If we have a professor URL, try to get more detailed data
        if (professorData.href && professorData.href.includes('instructor')) {
          try {
            logs.push({
              timestamp: new Date().toISOString(),
              action: `Navigating to professor page: ${professorData.href}`
            });

            await page.goto(professorData.href, { 
              waitUntil: 'networkidle',
              timeout: 15000 
            });

            await delay(1000);

            // Extract detailed professor information
            const detailedData = await page.evaluate(() => {
              const gpaSelectors = [
                '.professor-gpa-value',
                '.gpa-value',
                '[data-testid="gpa-value"]',
                '.standard-data',
                '.gpa'
              ];

              let avgGPA = 0;
              let gpaElement = '';

              for (const selector of gpaSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                  const gpaText = element.textContent?.trim() || '';
                  const gpaMatch = gpaText.match(/(\d+\.?\d*)/);
                  if (gpaMatch) {
                    avgGPA = parseFloat(gpaMatch[1]);
                    gpaElement = element.outerHTML;
                    break;
                  }
                }
              }

              // Get all text content for debugging
              const allText = document.body.innerText;
              
              return {
                avgGPA,
                gpaElement,
                pageText: allText.substring(0, 2000)
              };
            });

            if (detailedData.avgGPA > 0) {
              professorDebugData.avgGPA = detailedData.avgGPA;
            }

            professorDebugData.scrapedElements.allText = detailedData.pageText;

            logs.push({
              timestamp: new Date().toISOString(),
              action: `Extracted detailed data for professor: ${professorData.name}`,
              data: { avgGPA: detailedData.avgGPA }
            });

          } catch (error) {
            const errorMsg = `Failed to scrape detailed professor data: ${error instanceof Error ? error.message : 'Unknown error'}`;
            professorDebugData.errors = [errorMsg];
            logs.push({
              timestamp: new Date().toISOString(),
              action: 'Error scraping professor details',
              error: errorMsg
            });
          }
        }

        courseDebugData.professors.push(professorDebugData);

        logs.push({
          timestamp: new Date().toISOString(),
          action: `Added professor: ${professorData.name}`,
          data: professorDebugData
        });

      } catch (error) {
        const errorMsg = `Error processing professor element ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        courseDebugData.scrapingErrors.push(errorMsg);
        logs.push({
          timestamp: new Date().toISOString(),
          action: 'Error processing professor element',
          error: errorMsg
        });
      }
    }

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
    const { query, university, courses } = await request.json();

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Starting debug scraping session',
      data: { query, university, courses }
    });

    // Launch browser
    browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-setuid-sandbox',
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();

    // Extract courses from query if not provided
    let coursesToScrape = courses;
    if (!coursesToScrape || coursesToScrape.length === 0) {
      const courseRegex = /\b[A-Z]{2,4}\s*\d{4}\b/g;
      coursesToScrape = query.match(courseRegex) || [];
    }

    logs.push({
      timestamp: new Date().toISOString(),
      action: 'Extracted courses to scrape',
      data: { coursesToScrape }
    });

    const debugResults: CourseDebugData[] = [];

    // Scrape each course
    for (const courseCode of coursesToScrape) {
      const courseDebugData = await debugScrapeProfessorData(page, courseCode, university, logs);
      debugResults.push(courseDebugData);
      
      // Add delay between courses
      await delay(1000);
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