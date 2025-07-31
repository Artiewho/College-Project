import fs from 'fs/promises';
import path from 'path';

export interface CourseRecommendation {
  courseCode: string;
  courseName: string;
  averageGPA: number;
  bestProfessor: string;
  professorGPA: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  popularity: number;
  department: string;
}

export interface ScheduleRecommendation {
  semester: string;
  courses: CourseRecommendation[];
  totalCredits: number;
  expectedGPA: number;
}

export class CourseDataAnalyzer {
  private data: any = null;
  
  async loadLatestData(): Promise<void> {
    const dataDir = path.join(process.cwd(), 'data');
    
    try {
      const files = await fs.readdir(dataDir);
      const dataFiles = files
        .filter(file => file.startsWith('course-critique-data-'))
        .sort()
        .reverse(); // Get the latest file
      
      if (dataFiles.length === 0) {
        throw new Error('No course data files found. Run comprehensive scraping first.');
      }
      
      const latestFile = path.join(dataDir, dataFiles[0]);
      const fileContent = await fs.readFile(latestFile, 'utf-8');
      this.data = JSON.parse(fileContent);
      
      console.log(`Loaded data from: ${dataFiles[0]}`);
      console.log(`Total courses: ${this.data.totalCourses}`);
      
    } catch (error) {
      throw new Error(`Failed to load course data: ${error}`);
    }
  }
  
  // Get best courses by GPA for a specific department
  getBestCoursesByDepartment(department: string, limit: number = 10): CourseRecommendation[] {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    return this.data.courses
      .filter((course: any) => course.department === department)
      .sort((a: any, b: any) => b.averageGPA - a.averageGPA)
      .slice(0, limit)
      .map((course: any) => this.formatCourseRecommendation(course));
  }
  
  // Get easiest electives across all departments
  getEasiestElectives(limit: number = 20): CourseRecommendation[] {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    // Filter for likely elective courses (avoid core requirements)
    const electiveKeywords = ['intro', 'survey', 'appreciation', 'topics', 'special', 'seminar'];
    const coreKeywords = ['calculus', 'physics', 'chemistry', 'differential', 'linear algebra'];
    
    return this.data.courses
      .filter((course: any) => {
        const courseName = course.courseName.toLowerCase();
        const hasElectiveKeyword = electiveKeywords.some(keyword => courseName.includes(keyword));
        const hasCoreKeyword = coreKeywords.some(keyword => courseName.includes(keyword));
        
        // Include if it has elective keywords or doesn't have core keywords and has high GPA
        return (hasElectiveKeyword || (!hasCoreKeyword && course.averageGPA > 3.5));
      })
      .sort((a: any, b: any) => b.averageGPA - a.averageGPA)
      .slice(0, limit)
      .map((course: any) => this.formatCourseRecommendation(course));
  }
  
  // Get courses by GPA range
  getCoursesByGPARange(minGPA: number, maxGPA: number = 4.0): CourseRecommendation[] {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    return this.data.courses
      .filter((course: any) => course.averageGPA >= minGPA && course.averageGPA <= maxGPA)
      .sort((a: any, b: any) => b.averageGPA - a.averageGPA)
      .map((course: any) => this.formatCourseRecommendation(course));
  }
  
  // Generate optimal schedule for a semester
  generateOptimalSchedule(
    requiredCourses: string[],
    electiveSlots: number,
    targetGPA: number = 3.8
  ): ScheduleRecommendation {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    const schedule: CourseRecommendation[] = [];
    
    // Add required courses
    for (const courseCode of requiredCourses) {
      const course = this.data.courses.find((c: any) => c.courseCode === courseCode);
      if (course) {
        schedule.push(this.formatCourseRecommendation(course));
      }
    }
    
    // Fill remaining slots with highest GPA electives
    const availableElectives = this.getEasiestElectives(50)
      .filter(course => !requiredCourses.includes(course.courseCode));
    
    for (let i = 0; i < electiveSlots && i < availableElectives.length; i++) {
      schedule.push(availableElectives[i]);
    }
    
    // Calculate expected GPA
    const totalGPAPoints = schedule.reduce((sum, course) => sum + course.averageGPA, 0);
    const expectedGPA = schedule.length > 0 ? totalGPAPoints / schedule.length : 0;
    
    return {
      semester: 'Optimized Semester',
      courses: schedule,
      totalCredits: schedule.length * 3, // Assume 3 credits per course
      expectedGPA
    };
  }
  
  // Get department statistics
  getDepartmentStats(): { [department: string]: any } {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    const stats: { [department: string]: any } = {};
    
    this.data.departments.forEach((dept: string) => {
      const deptCourses = this.data.courses.filter((course: any) => course.department === dept);
      
      if (deptCourses.length > 0) {
        const gpas = deptCourses.map((course: any) => course.averageGPA);
        const avgGPA = gpas.reduce((sum: number, gpa: number) => sum + gpa, 0) / gpas.length;
        const maxGPA = Math.max(...gpas);
        const minGPA = Math.min(...gpas);
        
        stats[dept] = {
          totalCourses: deptCourses.length,
          averageGPA: avgGPA,
          maxGPA,
          minGPA,
          highestGPACourse: deptCourses.find((course: any) => course.averageGPA === maxGPA)?.courseCode,
          lowestGPACourse: deptCourses.find((course: any) => course.averageGPA === minGPA)?.courseCode
        };
      }
    });
    
    return stats;
  }
  
  // Search courses by name or code
  searchCourses(query: string): CourseRecommendation[] {
    if (!this.data) {
      throw new Error('Data not loaded. Call loadLatestData() first.');
    }
    
    const searchTerm = query.toLowerCase();
    
    return this.data.courses
      .filter((course: any) => 
        course.courseCode.toLowerCase().includes(searchTerm) ||
        course.courseName.toLowerCase().includes(searchTerm)
      )
      .sort((a: any, b: any) => b.averageGPA - a.averageGPA)
      .map((course: any) => this.formatCourseRecommendation(course));
  }
  
  private formatCourseRecommendation(course: any): CourseRecommendation {
    // Find best professor
    const bestProfessor = course.professors.length > 0 
      ? course.professors.reduce((best: any, prof: any) => 
          prof.avgGPA > best.avgGPA ? prof : best
        )
      : null;
    
    // Determine difficulty based on GPA
    let difficulty: 'Easy' | 'Medium' | 'Hard';
    if (course.averageGPA >= 3.7) difficulty = 'Easy';
    else if (course.averageGPA >= 3.3) difficulty = 'Medium';
    else difficulty = 'Hard';
    
    // Calculate popularity (total students)
    const popularity = course.professors.reduce((sum: number, prof: any) => sum + prof.totalStudents, 0);
    
    return {
      courseCode: course.courseCode,
      courseName: course.courseName,
      averageGPA: course.averageGPA,
      bestProfessor: bestProfessor?.name || 'Unknown',
      professorGPA: bestProfessor?.avgGPA || 0,
      difficulty,
      popularity,
      department: course.department
    };
  }
}

// Export utility functions
export async function getOptimalCourseRecommendations(
  major: string,
  requiredCourses: string[],
  electiveCount: number = 5
): Promise<{
  required: CourseRecommendation[];
  electives: CourseRecommendation[];
  analysis: string;
}> {
  const analyzer = new CourseDataAnalyzer();
  await analyzer.loadLatestData();
  
  // Get data for required courses
  const required = requiredCourses.map(courseCode => {
    const results = analyzer.searchCourses(courseCode);
    return results.length > 0 ? results[0] : null;
  }).filter(Boolean) as CourseRecommendation[];
  
  // Get best electives
  const electives = analyzer.getEasiestElectives(electiveCount);
  
  // Generate analysis
  const avgRequiredGPA = required.length > 0 
    ? required.reduce((sum, course) => sum + course.averageGPA, 0) / required.length 
    : 0;
  
  const avgElectiveGPA = electives.length > 0 
    ? electives.reduce((sum, course) => sum + course.averageGPA, 0) / electives.length 
    : 0;
  
  const analysis = `
Analysis for ${major} Major:

Required Courses Average GPA: ${avgRequiredGPA.toFixed(2)}
Recommended Electives Average GPA: ${avgElectiveGPA.toFixed(2)}
Overall Expected GPA: ${((avgRequiredGPA + avgElectiveGPA) / 2).toFixed(2)}

Strategy:
- Focus on the highest GPA electives to boost overall GPA
- Choose professors with the highest average GPAs
- Consider course difficulty and workload balance
`;
  
  return { required, electives, analysis };
}