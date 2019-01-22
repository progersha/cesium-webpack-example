require('cesium/Widgets/widgets.css');
require('./css/main.css');

const lodash = require('lodash');
const Cesium = require('cesium/Cesium');

const viewer = new Cesium.Viewer('cesiumContainer');
viewer.camera.flyTo({ destination: new Cesium.Rectangle.fromDegrees(-84, 43, -80, 47) });

const layers = viewer.imageryLayers;
layers.removeAll();

const timerMsCount = 1000;
const requestWaitersQueue = [];
const cache = new Map();
const cacheMaxSize = 300;

let isStartCalcCaching = false;
let countImageLoaded = 0;
let countImageFromCache = 0;

const debouncedWaitAllRequests = lodash.debounce(waitAllRequests, timerMsCount, {
    'leading': true,
    'trailing': true
});

const imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
    url : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
});

const baseLayer = layers.addImageryProvider(imageryProvider);

function startCalcCaching() {
    isStartCalcCaching = true;

    countImageLoaded = 0;
    countImageFromCache = 0;

    baseLayer.saturation = 0;

    console.group('CACHING');
}

function endCalcCaching() {
    isStartCalcCaching = false;

    console.log('new images loaded: ', countImageLoaded);
    console.log('images from cache: ', countImageFromCache);
    console.log('Total images in cache: ', cache.size);
    console.groupEnd();

    baseLayer.saturation = 1;
}

function waitAllRequests() {
    return Promise.all( [...requestWaitersQueue] ).then(
        () => {
            requestWaitersQueue.splice(0, requestWaitersQueue.length);
            endCalcCaching();
        }
    );
}

function monkeyPatch(target, key, patchFn) {
    const originFn = target[key].bind(target);
    target[key] = patchFn(originFn);
    return target;
}

monkeyPatch(imageryProvider, 'requestImage', originFn => (x, y, level) => {
    const id = '' + x + y + level;
    const cachedValue = cache.get(id);

    if (cachedValue && cachedValue.loaded) {
        countImageFromCache++;
        return cachedValue.data;
    } else if (cachedValue && cachedValue.pending) {
        return cachedValue.promise;
    } else {
        // console.log('new Request', id, cache.size);
        const waitOriginFn = originFn(x, y, level);
        requestWaitersQueue.push(waitOriginFn);

        if (!isStartCalcCaching) {
            startCalcCaching();
        }

        const globalWaiter = debouncedWaitAllRequests();
        const promise = waitOriginFn.then( result => new Promise( resolve => {
            cache.set(id, {
                pending: false,
                loaded: true,
                data: result,
            });

            return globalWaiter.then( () => {
                return resolve(result);
            });
        }));

        if (cache.size > cacheMaxSize) {
            const ids = Array.from(cache.keys()).slice(0, 100);
            ids.forEach(_id => cache.delete(_id));
            console.log('*** cache clear ***');
        }

        const newCachedValue = {
            loaded: false,
            pending: true,
            promise: promise,
        };

        cache.set(id, newCachedValue);

        countImageLoaded++;

        return promise;
    }
});