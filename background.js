//
// Start a control panel for a tab.
// 
function start(tab) {
    chrome.windows.create({
        'url': 'ht.html',
        'type': 'popup',
        'width': 1400,
        'height': 1024
    }, function(y) {
        console.log('made window');
    });
}


//
// The extension button is clicked
//
chrome.browserAction.onClicked.addListener(function(tab) {
    start(tab);
});