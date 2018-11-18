require('cesium/Widgets/widgets.css');
require('./css/main.css');
var fetchIntercept = request('fetch-intercept');
var Cesium = require('cesium/Cesium');

// Example app

var viewer = new Cesium.Viewer('cesiumContainer');

function isCacheable(method, url) {
    if (method.toUpperCase() !== "GET") {
        return false;
    }
    const ends = [".png", ".jpeg", ".tiff", ".gif"];
    return !!ends.find(item => url.indexOf(item) !== -1
    );
}



var open = window.XMLHttpRequest.prototype.open;

var cache = new Map();

const cacheInterceptor = fetchIntercept.register({
    request: function (url, config) {
        // Modify the url or config here
        console.log('[request]', url);
        return [url, config];
    },

    requestError: function (error) {
        // Called when an error occured during another 'request' interceptor call
        return Promise.reject(error);
    },

    response: function (response) {
        console.log('[response]', response);
        // Modify the reponse object
        return response;
    },

    responseError: function (error) {
        // Handle an fetch error
        return Promise.reject(error);
    }
});

cacheInterceptor();

function openReplacement(method, url, async, user, password) {
    if (!isCacheable(method, url)) {
        return open.apply(this, arguments);
    }
    if (cache.has(url)) {
        return cache.get(url);
    }
    fetch(url);
    return null;
}
window.XMLHttpRequest.prototype.open = openReplacement;