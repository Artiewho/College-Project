import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import fs from 'fs/promises';
import path from 'path';
import OpenAI from 'openai';
import { searchWeb } from '../../utils/searchApi';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface CourseData {
  courseCode: string;
  courseName: string;
  department: string;
  professors: ProfessorData[];
  averageGPA: number;
  totalSections: number;
  url: string;
}

interface ProfessorData {
  name: string;
  avgGPA: number;
  sections: SectionData[];
  totalStudents: number;
  url: string;
}

interface SectionData {
  semester: string;
  year: string;
  gpa: number;
  students: number;
  section: string;
}

interface ComprehensiveData {
  university: string;
  lastUpdated: string;
  totalCourses: number;
  totalProfessors: number;
  departments: string[];
  courses: CourseData[];
  summary: {
    highestGPACourses: CourseData[];
    lowestGPACourses: CourseData[];
    mostPopularCourses: CourseData[];
    departmentAverages: { [key: string]: number };
  };
}

// Utility function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with retry mechanism
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      // Exponential backoff
      await delay(baseDelay * Math.pow(2, attempt - 1));
    }
  }
  throw new Error('All retry attempts failed');
}

// Scrape all departments from Course Critique
async function scrapeAllDepartments(page: any): Promise<string[]> {
  console.log('Scraping all departments...');
  
  // Navigate to the main Course Critique page
  await page.goto('https://critique.gatech.edu/', { 
    waitUntil: 'networkidle',
    timeout: 30000 
  });
  
  // Wait for the page to load and find department links
  await page.waitForSelector('a[href*="/course/"]', { timeout: 10000 });
  
  // Extract all unique department codes
  const departments = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/course/"]'));
    const deptSet = new Set<string>();
    
    links.forEach((link: any) => {
      const href = link.href;
      const match = href.match(/\/course\/([A-Z]{2,4})/);
      if (match) {
        deptSet.add(match[1]);
      }
    });
    
    return Array.from(deptSet);
  });
  
  console.log(`Found ${departments.length} departments:`, departments);
  return departments;
}

// Scrape all courses for a specific department
async function scrapeDepartmentCourses(page: any, department: string): Promise<CourseData[]> {
  console.log(`Scraping courses for department: ${department}`);
  
  const courses: CourseData[] = [];
  
  try {
    // Navigate to department page
    await page.goto(`https://critique.gatech.edu/course/${department}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait for course links to load
    await page.waitForSelector('a[href*="/course/"]', { timeout: 10000 });
    
    // Extract all course links for this department
    const courseLinks = await page.evaluate((dept) => {
      const links = Array.from(document.querySelectorAll('a[href*="/course/"]'));
      return links
        .map((link: any) => ({
          href: link.href,
          text: link.textContent?.trim() || ''
        }))
        .filter(link => link.href.includes(`/course/${dept}`))
        .filter(link => /\d{4}/.test(link.href)); // Only courses with 4-digit numbers
    }, department);
    
    console.log(`Found ${courseLinks.length} courses in ${department}`);
    
    // Scrape each course
    for (const courseLink of courseLinks) {
      try {
        const courseData = await scrapeCourseData(page, courseLink.href, department);
        if (courseData) {
          courses.push(courseData);
        }
        
        // Add delay between course scrapes to avoid rate limiting
        await delay(500);
      } catch (error) {
        console.error(`Error scraping course ${courseLink.href}:`, error);
        continue;
      }
    }
    
  } catch (error) {
    console.error(`Error scraping department ${department}:`, error);
  }
  
  return courses;
}

// Scrape detailed data for a specific course
async function scrapeCourseData(page: any, courseUrl: string, department: string): Promise<CourseData | null> {
  try {
    await page.goto(courseUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Extract course information
    const courseInfo = await page.evaluate(() => {
      // Get course code and name
      const titleElement = document.querySelector('h1, .course-title, .page-title');
      const title = titleElement?.textContent?.trim() || '';
      
      // Extract course code (e.g., "CS 1301")
      const codeMatch = title.match(/([A-Z]{2,4})\s*(\d{4})/);
      const courseCode = codeMatch ? `${codeMatch[1]} ${codeMatch[2]}` : '';
      
      // Extract course name (everything after the course code)
      const courseName = title.replace(/^[A-Z]{2,4}\s*\d{4}\s*[-:]?\s*/, '').trim();
      
      return {
        courseCode,
        courseName,
        title
      };
    });
    
    if (!courseInfo.courseCode) {
      console.log(`Could not extract course code from: ${courseUrl}`);
      return null;
    }
    
    // Scrape professor data for this course
    const professors = await scrapeProfessorsForCourse(page);
    
    // Calculate course statistics
    const totalSections = professors.reduce((sum, prof) => sum + prof.sections.length, 0);
    const totalGPAPoints = professors.reduce((sum, prof) => 
      sum + prof.sections.reduce((profSum, section) => profSum + (section.gpa * section.students), 0), 0
    );
    const totalStudents = professors.reduce((sum, prof) => sum + prof.totalStudents, 0);
    const averageGPA = totalStudents > 0 ? totalGPAPoints / totalStudents : 0;
    
    return {
      courseCode: courseInfo.courseCode,
      courseName: courseInfo.courseName,
      department,
      professors,
      averageGPA,
      totalSections,
      url: courseUrl
    };
    
  } catch (error) {
    console.error(`Error scraping course data from ${courseUrl}:`, error);
    return null;
  }
}

// Scrape professor data for a course
async function scrapeProfessorsForCourse(page: any): Promise<ProfessorData[]> {
  const professors: ProfessorData[] = [];
  
  try {
    // Look for professor links
    const professorLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/instructor/"]'));
      return links.map((link: any) => ({
        href: link.href,
        name: link.textContent?.trim() || ''
      }));
    });
    
    // Scrape each professor
    for (const profLink of professorLinks) {
      try {
        const professorData = await scrapeProfessorData(page, profLink.href, profLink.name);
        if (professorData) {
          professors.push(professorData);
        }
        
        // Small delay between professor scrapes
        await delay(300);
      } catch (error) {
        console.error(`Error scraping professor ${profLink.name}:`, error);
        continue;
      }
    }
    
  } catch (error) {
    console.error('Error scraping professors for course:', error);
  }
  
  return professors;
}

// Scrape detailed professor data
async function scrapeProfessorData(page: any, professorUrl: string, professorName: string): Promise<ProfessorData | null> {
  try {
    await page.goto(professorUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Extract professor GPA and section data
    const professorInfo = await page.evaluate(() => {
      const sections: any[] = [];
      let totalStudents = 0;
      let totalGPAPoints = 0;
      
      // Look for GPA data in various possible selectors
      const gpaSelectors = [
        '.professor-gpa-value',
        '.gpa-value',
        '[data-testid="gpa-value"]',
        '.standard-data',
        '.gpa'
      ];
      
      let avgGPA = 0;
      for (const selector of gpaSelectors) {
        const gpaElement = document.querySelector(selector);
        if (gpaElement) {
          const gpaText = gpaElement.textContent?.trim() || '';
          const gpaMatch = gpaText.match(/(\d+\.?\d*)/);
          if (gpaMatch) {
            avgGPA = parseFloat(gpaMatch[1]);
            break;
          }
        }
      }
      
      // Look for section data in tables
      const rows = Array.from(document.querySelectorAll('tr, .section-row, .data-row'));
      rows.forEach((row: any) => {
        const cells = Array.from(row.querySelectorAll('td, .cell, .data-cell'));
        if (cells.length >= 3) {
          // Try to extract semester, GPA, and student count
          const semester = cells[0]?.textContent?.trim() || '';
          const gpaText = cells[1]?.textContent?.trim() || '';
          const studentsText = cells[2]?.textContent?.trim() || '';
          
          const gpaMatch = gpaText.match(/(\d+\.?\d*)/);
          const studentsMatch = studentsText.match(/(\d+)/);
          
          if (gpaMatch && studentsMatch && semester) {
            const sectionGPA = parseFloat(gpaMatch[1]);
            const sectionStudents = parseInt(studentsMatch[1]);
            
            sections.push({
              semester: semester,
              year: new Date().getFullYear().toString(), // Default to current year
              gpa: sectionGPA,
              students: sectionStudents,
              section: 'A' // Default section
            });
            
            totalStudents += sectionStudents;
            totalGPAPoints += sectionGPA * sectionStudents;
          }
        }
      });
      
      // If no sections found but we have an average GPA, create a default section
      if (sections.length === 0 && avgGPA > 0) {
        sections.push({
          semester: 'Fall',
          year: new Date().getFullYear().toString(),
          gpa: avgGPA,
          students: 50, // Default student count
          section: 'A'
        });
        totalStudents = 50;
      }
      
      // Recalculate average GPA if we have section data
      if (sections.length > 0 && totalStudents > 0) {
        avgGPA = totalGPAPoints / totalStudents;
      }
      
      return {
        avgGPA,
        sections,
        totalStudents
      };
    });
    
    return {
      name: professorName,
      avgGPA: professorInfo.avgGPA,
      sections: professorInfo.sections,
      totalStudents: professorInfo.totalStudents,
      url: professorUrl
    };
    
  } catch (error) {
    console.error(`Error scraping professor data from ${professorUrl}:`, error);
    return null;
  }
}

// Generate comprehensive analysis using ChatGPT
async function generateAnalysis(data: ComprehensiveData): Promise<string> {
  try {
    const prompt = `
Analyze this comprehensive Course Critique data and provide insights for optimal class selection:

University: ${data.university}
Total Courses: ${data.totalCourses}
Total Professors: ${data.totalProfessors}
Departments: ${data.departments.join(', ')}

Course Data Summary:
${JSON.stringify(data.summary, null, 2)}

Top 20 Highest GPA Courses:
${data.summary.highestGPACourses.slice(0, 20).map(course => 
  `${course.courseCode}: ${course.courseName} (GPA: ${course.averageGPA.toFixed(2)})`
).join('\n')}

Please provide:
1. Best courses for maximizing GPA by department
2. Easiest elective recommendations
3. Professor recommendations for high-GPA courses
4. Strategic course selection advice
5. Department-specific insights

Format your response as a comprehensive guide for students.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert academic advisor analyzing course data to help students maximize their GPA while meeting degree requirements."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error('Error generating analysis:', error);
    return 'Analysis generation failed.';
  }
}

// Save data to local file
async function saveDataToFile(data: ComprehensiveData, analysis: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `course-critique-data-${timestamp}.json`;
  const analysisFileName = `course-analysis-${timestamp}.md`;
  
  const dataDir = path.join(process.cwd(), 'data');
  
  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(dataDir, { recursive: true });
    
    // Save comprehensive data
    const dataPath = path.join(dataDir, fileName);
    await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
    
    // Save analysis
    const analysisPath = path.join(dataDir, analysisFileName);
    await fs.writeFile(analysisPath, analysis);
    
    console.log(`Data saved to: ${dataPath}`);
    console.log(`Analysis saved to: ${analysisPath}`);
    
    return dataPath;
  } catch (error) {
    console.error('Error saving data:', error);
    throw error;
  }
}

// Main scraping function
async function scrapeAllCourseCritiqueData(): Promise<ComprehensiveData> {
  const browser = await chromium.launch({
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

  let allCourses: CourseData[] = [];
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      viewport: { width: 1280, height: 720 }
    });
    
    const page = await context.newPage();
    
    // Step 1: Get all departments
    const departments = await fetchWithRetry(() => scrapeAllDepartments(page));
    
    // Step 2: Scrape courses for each department
    for (const department of departments) {
      console.log(`Processing department: ${department}`);
      
      try {
        const departmentCourses = await fetchWithRetry(() => 
          scrapeDepartmentCourses(page, department)
        );
        
        allCourses = allCourses.concat(departmentCourses);
        console.log(`Completed ${department}: ${departmentCourses.length} courses`);
        
        // Add delay between departments to avoid rate limiting
        await delay(2000);
      } catch (error) {
        console.error(`Failed to scrape department ${department}:`, error);
        continue;
      }
    }
    
    // Step 3: Generate summary statistics
    const summary = generateSummaryStatistics(allCourses);
    
    const comprehensiveData: ComprehensiveData = {
      university: 'Georgia Institute of Technology',
      lastUpdated: new Date().toISOString(),
      totalCourses: allCourses.length,
      totalProfessors: allCourses.reduce((sum, course) => sum + course.professors.length, 0),
      departments,
      courses: allCourses,
      summary
    };
    
    return comprehensiveData;
    
  } finally {
    await browser.close();
  }
}

// Generate summary statistics
function generateSummaryStatistics(courses: CourseData[]) {
  // Sort courses by GPA
  const sortedByGPA = [...courses].sort((a, b) => b.averageGPA - a.averageGPA);
  
  // Sort by popularity (total students)
  const sortedByPopularity = [...courses].sort((a, b) => {
    const aStudents = a.professors.reduce((sum, prof) => sum + prof.totalStudents, 0);
    const bStudents = b.professors.reduce((sum, prof) => sum + prof.totalStudents, 0);
    return bStudents - aStudents;
  });
  
  // Calculate department averages
  const departmentAverages: { [key: string]: number } = {};
  const departmentCounts: { [key: string]: number } = {};
  
  courses.forEach(course => {
    if (!departmentAverages[course.department]) {
      departmentAverages[course.department] = 0;
      departmentCounts[course.department] = 0;
    }
    departmentAverages[course.department] += course.averageGPA;
    departmentCounts[course.department]++;
  });
  
  // Calculate final averages
  Object.keys(departmentAverages).forEach(dept => {
    departmentAverages[dept] = departmentAverages[dept] / departmentCounts[dept];
  });
  
  return {
    highestGPACourses: sortedByGPA.slice(0, 50),
    lowestGPACourses: sortedByGPA.slice(-20),
    mostPopularCourses: sortedByPopularity.slice(0, 30),
    departmentAverages
  };
}

// API endpoint
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    if (action === 'scrape-all') {
      console.log('Starting comprehensive Course Critique scraping...');
      
      // Scrape all data
      const comprehensiveData = await scrapeAllCourseCritiqueData();
      
      // Generate ChatGPT analysis
      console.log('Generating ChatGPT analysis...');
      const analysis = await generateAnalysis(comprehensiveData);
      
      // Save to files
      const filePath = await saveDataToFile(comprehensiveData, analysis);
      
      return NextResponse.json({
        success: true,
        message: 'Comprehensive scraping completed successfully',
        data: {
          totalCourses: comprehensiveData.totalCourses,
          totalProfessors: comprehensiveData.totalProfessors,
          departments: comprehensiveData.departments,
          filePath,
          analysis: analysis.substring(0, 1000) + '...' // Truncated for response
        }
      });
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    
  } catch (error) {
    console.error('Comprehensive scraping error:', error);
    return NextResponse.json(
      { error: `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

// GET endpoint to check status or retrieve saved data
export async function GET(request: NextRequest) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    
    try {
      const files = await fs.readdir(dataDir);
      const dataFiles = files.filter(file => file.startsWith('course-critique-data-'));
      const analysisFiles = files.filter(file => file.startsWith('course-analysis-'));
      
      return NextResponse.json({
        success: true,
        availableDataFiles: dataFiles,
        availableAnalysisFiles: analysisFiles,
        dataDirectory: dataDir
      });
    } catch (error) {
      return NextResponse.json({
        success: true,
        message: 'No data files found yet',
        dataDirectory: dataDir
      });
    }
    
  } catch (error) {
    console.error('Error checking data files:', error);
    return NextResponse.json(
      { error: 'Failed to check data files' },
      { status: 500 }
    );
  }
}