(function(){
    if (localStorage.getItem('sleeptimer_installed') === 'true') {
        var code = localStorage.getItem('sleeptimer_code');
        if (code) {
            try { new Function(code)(); } catch(e) { console.error('[SleepTimer] Auto-load error:', e); }
        }
    }
})();
