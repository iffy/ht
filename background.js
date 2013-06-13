chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('ht.html', {
    bounds: {
      width: 600,
      height: 800
    },
    minWidth: 500,
    minHeight: 600
  });
});