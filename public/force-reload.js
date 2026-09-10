// Force reload if old cached version detected
(function() {
    const buildTimestamp = Date.now();
    console.log('🔥 FORCE RELOAD SCRIPT LOADED:', buildTimestamp);
    
    // Check if we're on the design page with AI
    if (window.location.pathname === '/design' && window.location.search.includes('ai=1')) {
        console.log('🔥 AI DESIGN PAGE DETECTED - Checking for updates...');
        
        // Force reload if cached version is detected
        setTimeout(() => {
            if (!window.AI_BUTTONS_FIXED) {
                console.log('🔥 OLD VERSION DETECTED - FORCING RELOAD...');
                window.location.reload(true);
            }
        }, 2000);
    }
})();
