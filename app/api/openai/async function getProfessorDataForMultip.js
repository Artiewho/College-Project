async function getProfessorDataForMultipleCourses(university, courses) {
  const professorDataMap = new Map();
  
  for (const course of courses) {
    try {
      const response = await fetch('/api/scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          university,
          course,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.allProfessors && data.allProfessors.length > 0) {
          professorDataMap.set(course, data.allProfessors);
        }
      }
    } catch (error) {
      console.error(`Error fetching professor data for ${course}:`, error);
    }
  }
  
  return professorDataMap;
}

// Example usage
const university = 'Georgia Tech';
const courses = ['CS 1301', 'MATH 1552', 'PHYS 2211'];

getProfessorDataForMultipleCourses(university, courses).then(professorDataMap => {
  // Process the data
  for (const [course, professors] of professorDataMap.entries()) {
    console.log(`\n${course}:`);
    if (professors.length > 0) {
      professors.forEach(prof => {
        console.log(`- Prof: ${prof.name} | GPA: ${prof.avgGPA.toFixed(1)}`);
      });
    } else {
      console.log('- No professor data found.');
    }
  }
});