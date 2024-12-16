// JavaScript to handle compass interactivity for both desktop and mobile
document.querySelectorAll('.compass-icon').forEach(icon => {
    const handleInteraction = () => {
        const experienceLabel = icon.getAttribute('data-label');
        document.getElementById('experience-subtitle').textContent = `Explore Ibiza with ${experienceLabel}`;
        const ctaButton = document.getElementById('cta-button');
        ctaButton.innerHTML = `<span>Book Your ${experienceLabel}</span>`;
        ctaButton.classList.add('btn-book'); 
    };

    icon.addEventListener('mouseover', handleInteraction);
    icon.addEventListener('touchstart', handleInteraction);
});