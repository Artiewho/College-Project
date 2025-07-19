// University search functionality
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.querySelector('.university-search');
    const select = document.querySelector('.university-select');
    const options = Array.from(select.options);

    searchInput.addEventListener('focus', function() {
        select.style.display = 'block';
    });

    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        
        options.forEach(option => {
            const text = option.text.toLowerCase();
            option.style.display = text.includes(searchTerm) ? '' : 'none';
        });

        select.style.display = 'block';
    });

    select.addEventListener('change', function() {
        searchInput.value = this.options[this.selectedIndex].text;
        select.style.display = 'none';
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.university-select-container')) {
            select.style.display = 'none';
        }
    });
});

// Dark mode toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const universitySelect = document.querySelector('.university-select');
    const universityOptions = Array.from(universitySelect.options);
    
    // Check if dark mode was previously enabled
    if (localStorage.getItem('darkMode') === 'enabled') {
        darkModeToggle.classList.add('active');
        document.body.classList.add('dark-mode');
        applyDarkModeToSelect(true);
    }
    
    darkModeToggle.addEventListener('click', function() {
        this.classList.toggle('active');
        const isDarkMode = document.body.classList.toggle('dark-mode');
        
        // Apply dark mode to select element
        applyDarkModeToSelect(isDarkMode);
        
        // Save preference to localStorage
        localStorage.setItem('darkMode', isDarkMode ? 'enabled' : 'disabled');
    });
    
    function applyDarkModeToSelect(isDarkMode) {
        if (isDarkMode) {
            universitySelect.style.backgroundColor = '#333';
            universitySelect.style.color = '#f8f8f8';
            universitySelect.style.borderColor = '#555';
            
            universityOptions.forEach(option => {
                option.style.backgroundColor = '#333';
                option.style.color = '#f8f8f8';
            });
        } else {
            universitySelect.style.backgroundColor = 'white';
            universitySelect.style.color = '#333';
            universitySelect.style.borderColor = '#ddd';
            
            universityOptions.forEach(option => {
                option.style.backgroundColor = 'white';
                option.style.color = '#333';
            });
        }
    }
});

// Typing animation functionality
const texts = [
    "Get Help With Class Scheduling",
    "Get Help With Professors",
    "Get Help With Counseling"
];
let currentIndex = 0;
let isDeleting = false;
let currentText = '';
let typingSpeed = 50;
const deletingSpeed = 30;
const pauseTime = 1500;

const typingElement = document.querySelector('.typing-text');

function type() {
    const fullText = texts[currentIndex];
    
    if (isDeleting) {
        currentText = fullText.substring(0, currentText.length - 1);
    } else {
        currentText = fullText.substring(0, currentText.length + 1);
    }

    typingElement.textContent = currentText;

    if (!isDeleting && currentText === fullText) {
        isDeleting = true;
        setTimeout(type, pauseTime);
        return;
    }

    if (isDeleting && currentText === '') {
        isDeleting = false;
        currentIndex = (currentIndex + 1) % texts.length;
        setTimeout(type, typingSpeed);
        return;
    }

    setTimeout(type, isDeleting ? deletingSpeed : typingSpeed);
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(type, typingSpeed);
});