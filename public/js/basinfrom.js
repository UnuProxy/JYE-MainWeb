document.getElementById('contactForm').addEventListener('submit', function (e) {
    e.preventDefault(); 

    const formData = new FormData(this); 

    fetch('https://usebasin.com/f/5bf7d9c6072f', {
        method: 'POST',
        body: formData,
    })
    .then(response => {
        if (response.ok) {
            // Show the modal popup
            document.getElementById('thankYouModal').style.display = 'block';
            // Reset the form
            document.getElementById('contactForm').reset();
        } else {
            alert('Something went wrong. Please try again.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error submitting the form.');
    });
});

function closeModal() {
    document.getElementById('thankYouModal').style.display = 'none';
}