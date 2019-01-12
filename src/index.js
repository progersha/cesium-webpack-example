
/**
 * TODO: check promlems related context
 * Monkey pathing function
 * @param {object} target Object for monkey pathing
 * @param {string} key function key
 * @param {Function} patchFn monkey patching function
 *
 * @example patch result
 * monkeyPatch(obj, 'test-property', (originFn) => (...args) => {
 *  const originRes = originFn(...args);
 *  return patchOriginResFunction(originRes);
 * })
 *
 * @example patch params
 * monkeyPatch(obj, 'test-property', (originFn) => (...args) => {
 *  const patchedParams = patchParamsFunction(...args);
 *  return originFn(...patchedParams);
 * })
 */
function monkeyPatch(target, key, patchFn) {
    const originFn = target[key].bind(target);
    target[key] = patchFn(originFn);
    return target;
}

require('cesium/Widgets/widgets.css');
require('./css/main.css');
const lodash = require('lodash');
var fetchIntercept = require('fetch-intercept');
var Cesium = require('cesium/Cesium');

// Example app

var viewer = new Cesium.Viewer('cesiumContainer');

viewer.camera.flyTo({ destination: new Cesium.Rectangle.fromDegrees(-84, 43, -80, 47) });

var layers = viewer.imageryLayers;
layers.removeAll();

const timerMsCount = 1000;

const requestWaitersQueue = []; // array of promises

function waitAllRequests() {
    const timerId = Math.random().toString().substr(2, 4);
    console.time(`#${timerId}`)
    return new Promise( onRegisterCallsEnd => setTimeout( () => onRegisterCallsEnd(), timerMsCount)).then(
        // wait all registered promises
        () => {
            console.log('requestWaitersQueue.length', requestWaitersQueue.length);
            const waitAll = Promise.all( [...requestWaitersQueue] );
            requestWaitersQueue.splice(0, requestWaitersQueue.length);
            return waitAll;
        },
    ).then(
        // clean request waiters
        () => {
            console.timeEnd(`#${timerId}`);
        }
    );
}
function registerRequest(requestWaiter) {
    requestWaitersQueue.push(requestWaiter);
}

const debouncedWaitAllRequests = lodash.debounce(waitAllRequests, timerMsCount, { maxWait: timerMsCount });

const imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
    url : 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
});
const cache = new Map();
monkeyPatch(imageryProvider, 'requestImage', originFn => (x, y, level) => {
    console.log(Date.now() % timerMsCount);
    const id = '' + x + y + level;
    const cachedValue = cache.get(id);
    if(cachedValue && cachedValue.loaded) {
        // console.log('get from cache', id);
        return cachedValue.data;
    } else if (cachedValue && cachedValue.pending) {
        return cachedValue.promise;
    } else {
        // console.log('new Request', id, cache.size);
        const waitOriginFn = originFn(x, y, level);
        registerRequest(waitOriginFn);
        const globalWaiter = debouncedWaitAllRequests();
        const promise = waitOriginFn.then( result => new Promise( res => {
            cache.set(id, {
                pending: false,
                loaded: true,
                data: result,
            });
            console.log('[result]', result, imageryProvider._rectangle);
            // viewer.entities.add({
            //     polygon : {
            //         hierarchy : new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromRadiansArray(
            //             [-1.3194369277314022, 0.6988062530900625, -1.3193955980204217, 0.6988091578771254,
            //                 -1.3193931220959367, 0.698743632490865, -1.3194358224045408, 0.6987471965556998])),
            //         material : Cesium.Color.RED.withAlpha(0.5),
            //         classificationType : Cesium.ClassificationType.BOTH
            //     }
            // });
            return globalWaiter.then( () => {
                return res(result);
            });
        }));
        const newCachedValue = {
            loaded: false,
            pending: true,
            promise,
        };
        cache.set(id, newCachedValue);
        return promise;
    }
    // console.log(
    //     (viewer.scene.globe._surface._tilesToRender || []).map( a => {
    //         return Object.assign(a);
    //     } ), 'test'
    // );
    // console.log( Date.now() % 100000, id);
    // const promise = originFn(x, y, level);
    // return ;
});

var layerLinear = layers.addImageryProvider(imageryProvider);

// var layerNearest = layers.addImageryProvider(Cesium.createTileMapServiceImageryProvider({
//     url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII')
// }));
