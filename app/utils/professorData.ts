// Types for professor data
export interface ProfessorData {
  name: string;
  rating?: number;
  difficulty?: number;
  wouldTakeAgain?: number;
  avgGPA?: number;
  numRatings?: number;
  department?: string;
  url?: string;
}

// Format professor data for display
export function formatProfessorData(professor: ProfessorData): string {
  let result = `Prof: ${professor.name}`;
  
  // Add rating if available
  if (professor.rating !== undefined) {
    result += ` | Rating: ${professor.rating}/5`;
  }
  
  // Add GPA if available
  if (professor.avgGPA !== undefined) {
    result += ` | GPA: ${professor.avgGPA.toFixed(1)}`;
  }
  
  // Add difficulty if available
  if (professor.difficulty !== undefined) {
    result += ` | Diff: ${professor.difficulty}/5`;
  }
  
  // Add would take again if available
  if (professor.wouldTakeAgain !== undefined) {
    result += ` | Again: ${professor.wouldTakeAgain}%`;
  }
  
  return result;
}

// Extract course code from a course string
export function extractCourseCode(courseString: string): string {
  // Match patterns like "CS 1301", "MATH 2551", etc.
  const match = courseString.match(/([A-Z]{2,4})\s*(\d{4})/i);
  return match ? match[0] : courseString;
}

// Generate semester sequence starting from current year (2025)
export function generateSemesterSequence(numSemesters: number = 8, includeSummer: boolean = false): string[] {
  const currentYear = 2025; // Hardcoded current year
  const semesters = [];
  
  // Start with Fall of current year if we're before August, otherwise start with Spring of next year
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-indexed (0 = January, 7 = August)
  
  let startYear = currentYear;
  let startSemester = 'FALL';
  
  // If we're past August, start with Spring of next year
  if (currentMonth >= 7) { // August or later
    startYear = currentYear + 1;
    startSemester = 'SPRING';
  }
  
  let year = startYear;
  let semester = startSemester;
  
  // Count how many semesters we've added
  let semestersAdded = 0;
  
  // Keep adding semesters until we reach the requested number
  while (semestersAdded < numSemesters) {
    semesters.push(`${semester} ${year}`);
    semestersAdded++;
    
    // Advance to next semester
    if (semester === 'FALL') {
      semester = 'SPRING';
      year += 1;
    } else if (semester === 'SPRING') {
      // Skip summer unless specifically requested
      if (includeSummer) {
        semester = 'SUMMER';
      } else {
        semester = 'FALL';
      }
    } else { // SUMMER
      semester = 'FALL';
    }
  }
  
  return semesters;
}