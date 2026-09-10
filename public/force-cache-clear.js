// NUCLEAR CACHE CLEARING - Forces complete reload
(function() {
    const currentTime = Date.now();
    console.log('🚨 NUCLEAR CACHE CLEAR LOADED:', new Date(currentTime).toISOString());
    
    // Check if we're on the AI design page
    if (window.location.pathname === '/design' && window.location.search.includes('ai=1')) {
        console.log('🚨 AI DESIGN PAGE DETECTED - FORCING CACHE CLEAR');
        
        // Clear all possible caches
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    console.log('🚨 CLEARING CACHE:', name);
                    caches.delete(name);
                });
            });
        }
        
        // Clear localStorage and sessionStorage
        try {
            localStorage.clear();
            sessionStorage.clear();
            console.log('🚨 CLEARED LOCAL/SESSION STORAGE');
        } catch (e) {
            console.log('🚨 Could not clear storage:', e);
        }
        
        // Force reload after 3 seconds if old code detected
        setTimeout(() => {
            // Check if the new AI button code is loaded
            const scripts = Array.from(document.scripts);
            const hasNewCode = scripts.some(script => 
                script.src && script.src.includes('index-') && 
                script.src.includes('1758773171257')
            );
            
            if (!hasNewCode) {
                console.log('🚨 OLD CODE DETECTED - FORCING HARD RELOAD');
                window.location.reload(true);
            } else {
                console.log('🚨 NEW CODE DETECTED - Cache clear successful');
            }
        }, 3000);
    }
})();
