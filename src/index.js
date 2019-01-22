require('cesium/Widgets/widgets.css');
require('./css/main.css');

const lodash = require('lodash');
var Cesium = require('cesium/Cesium');

function monkeyPatch(target, method, patchFn) {
    const originFn = target[method].bind(target);
    target[method] = patchFn(originFn);
    return target;
}

var viewer = new Cesium.Viewer('cesiumContainer');
viewer.camera.flyTo({ destination: new Cesium.Rectangle.fromDegrees(-84, 43, -80, 47) });

var layers = viewer.imageryLayers;
layers.removeAll();

const timerMsCount = 1000;
const requestWaitersQueue = [];

function waitAllRequests() {
    const timerId = Math.random().toString().substr(2, 4);
    console.time(`#${timerId}`);
    //layers.raiseToTop(layerLoadingImage);
    return new Promise(resolve => setTimeout( () => resolve(), timerMsCount))
        .then(() => {
            console.log('requestWaitersQueue.length', requestWaitersQueue.length);
            const waitAll = Promise.all( [...requestWaitersQueue] );
            requestWaitersQueue.splice(0, requestWaitersQueue.length);
            return waitAll;
        })
        .then(() => {
            layers.raiseToTop(layerLinear);
            console.timeEnd(`#${timerId}`);
        })
        .catch(error => {
            console.log(error);
        });
}

const debouncedWaitAllRequests = lodash.debounce(waitAllRequests, timerMsCount, { maxWait: timerMsCount });

const imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
    url : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
});

const cache = new Map();
const maxSize = 10000;

monkeyPatch(imageryProvider, 'requestImage', originFn => (x, y, level) => {
    console.log(Date.now() % timerMsCount);
    const id = '' + x + y + level;
    const hasCache = cache.has(id);
    if (hasCache) {
        const cacheValue = cache.get(id);
        return hasCache.loaded
            ? cacheValue.data
            : cacheValue.request
    }
    console.log('new Request', id, cache.size);
    const waitOriginFn = originFn(x, y, level);
    requestWaitersQueue.push(waitOriginFn);
    const globalWaiter = debouncedWaitAllRequests();
    const request = waitOriginFn.then( result => new Promise( res => {
        cache.set(id, {
            loaded: true,
            data: result,
        });
        return globalWaiter.then( () => {
            return res(result);
        });
    }));
    if (cache.size > maxSize) {
        const ids = Array.from(cache.keys()).slice(0, 1000);
        ids.forEach(_id => cache.delete(_id));
    }
    const newCachedValue = {
        loaded: false,
        request: request,
    };
    cache.set(id, newCachedValue);
    return request;
});

const layerLinear = layers.addImageryProvider(imageryProvider);
// const layerLoadingImage = layers.addImageryProvider(new Cesium.SingleTileImageryProvider({
//     url : 'https://media1.giphy.com/media/26FLb8rHh0T5B576E/giphy.gif?cid=3640f6095c3a7cac50664f3373dfe729',
//     // rectangle : Cesium.Rectangle.fromDegrees(-115.0, 38.0, -107, 39.75)
// }));
