document.querySelectorAll('.nav-btn').forEach(button => {
    button.addEventListener('click', () => {
      // Remove 'active' class from all navigation buttons
      document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  
      // Add 'active' class to the clicked button
      button.classList.add('active');
  
      // Get the tab name from the button's span text
      const tabName = button.querySelector('span').textContent.toLowerCase();
  
      // Hide all sections and the hero banner
      document.querySelectorAll('section').forEach(section => section.style.display = 'none');
      document.querySelector('.hero-banner').style.display = 'none';
  
      // Switch between tabs
      if (tabName === 'home') {
        document.querySelector('.hero-banner').style.display = 'block'; // Show hero banner for Home
        document.querySelector('#upcoming-booking').style.display = 'block';
        document.querySelector('#things-to-do').style.display = 'block';
      } else if (tabName === 'bookings') {
        showBookings();
      } else if (tabName === 'profile') {
        showProfile();
      } else if (tabName === 'contact') {
        showContact();
      }
    });
  });
  
  // Default tab: Home
  document.querySelector('.hero-banner').style.display = 'block';
  document.querySelector('#upcoming-booking').style.display = 'block';
  document.querySelector('#things-to-do').style.display = 'block';
  
  // Function to dynamically show bookings
  function showBookings() {
    const bookingsSection = document.querySelector('#upcoming-booking');
    bookingsSection.innerHTML = ''; // Clear previous content
  
    // Mock data retrieval
    const bookings = []; // Assume this is retrieved from a database
  
    if (bookings.length > 0) {
      bookings.forEach(booking => {
        const bookingHTML = `
          <div class="booking-card">
            <h3><i class="fas fa-ship"></i> ${booking.title}</h3>
            <p><strong>Dates:</strong> ${booking.dates}</p>
            <p><strong>Guests:</strong> ${booking.guests}</p>
            <button class="details-btn"><i class="fas fa-info-circle"></i> View Details</button>
          </div>`;
        bookingsSection.insertAdjacentHTML('beforeend', bookingHTML);
      });
    } else {
      bookingsSection.innerHTML = '<p>No bookings found. Start planning your Ibiza experience!</p>';
    }
    bookingsSection.style.display = 'block';
  }
  
  // Function to dynamically show profile
  function showProfile() {
    const profileSection = document.querySelector('#upcoming-booking');
    profileSection.innerHTML = ''; // Clear previous content
  
    // Mock user profile retrieval
    const userProfile = {
      name: 'John Doe',
      membershipStatus: 'Active',
      memberSince: 'January 2023',
    };
  
    const profileHTML = `
      <h2>Your Profile</h2>
      <p><strong>Name:</strong> ${userProfile.name}</p>
      <p><strong>Membership Status:</strong> ${userProfile.membershipStatus}</p>
      <p><strong>Member Since:</strong> ${userProfile.memberSince}</p>`;
    profileSection.insertAdjacentHTML('beforeend', profileHTML);
  
    profileSection.style.display = 'block';
  }
  
  // Function to dynamically show contact information
  function showContact() {
    const contactSection = document.querySelector('#upcoming-booking');
    contactSection.innerHTML = ''; // Clear previous content
  
    const contactHTML = `
      <h2>Contact Us</h2>
      <p><strong>Email:</strong> info@justenjoyibiza.com</p>
      <p><strong>Phone:</strong> +34 123 456 789</p>
      <p><strong>Address:</strong> Marina Botafoch, Ibiza, Spain</p>
      <p><strong>Business Hours:</strong> Mon-Sun, 9:00 AM - 8:00 PM</p>`;
    contactSection.insertAdjacentHTML('beforeend', contactHTML);
  
    contactSection.style.display = 'block';
  }
  
  