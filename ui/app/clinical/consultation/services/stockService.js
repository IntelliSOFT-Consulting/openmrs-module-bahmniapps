'use strict';

angular.module('bahmni.clinical')
    .factory('stockService', ['$http', '$q', '$timeout', '$rootScope', function ($http, $q, $timeout, $rootScope) {

        var CACHE_TTL_MS = 120000; // 2 minutes
        var FETCH_TIMEOUT_MS = 3000; // 3 seconds
        var cache = {};

        var getCacheKey = function (drugCode, drugName) {
            return (drugCode && drugCode !== '') ? drugCode : drugName;
        };

        var getCached = function (drugCode, drugName) {
            var key = getCacheKey(drugCode, drugName);
            var entry = cache[key];
            if (entry && Date.now() < entry.expires) {
                return entry.data;
            }
            return null;
        };

        var setCache = function (drugCode, drugName, data) {
            var key = getCacheKey(drugCode, drugName);
            cache[key] = {data: data, expires: Date.now() + CACHE_TTL_MS};
        };

        var getDrugCodeFromReferenceMaps = function (drug) {
            if (drug.drugReferenceMaps && drug.drugReferenceMaps.length > 0) {
                var refMap = drug.drugReferenceMaps[0];
                return refMap.conceptReferenceTerm && refMap.conceptReferenceTerm.code;
            }
            return null;
        };

        var getDrugName = function (drug) {
            return drug.name || (drug.concept && drug.concept.name && drug.concept.name.name) || '';
        };

        var fetchStock = function (drugName, drugCode) {
            var cached = getCached(drugCode, drugName);
            if (cached) {
                return $q.resolve(cached);
            }

            var deferred = $q.defer();
            var resolved = false;

            var unavailable = {available: false, status: 'UNAVAILABLE', quantity: 0};

            var timer = $timeout(function () {
                if (!resolved) {
                    resolved = true;
                    setCache(drugCode, drugName, unavailable);
                    deferred.resolve(unavailable);
                    $rootScope.$broadcast('stock:ready', {key: getCacheKey(drugCode, drugName), data: unavailable});
                }
            }, FETCH_TIMEOUT_MS);

            $http.get('/openmrs/ws/rest/v1/odooconnector/stock', {
                params: {
                    drugName: drugName || '',
                    drugCode: drugCode || ''
                },
                withCredentials: true
            }).then(function (response) {
                if (!resolved) {
                    resolved = true;
                    $timeout.cancel(timer);
                    var data = response.data;
                    setCache(drugCode, drugName, data);
                    deferred.resolve(data);
                    $rootScope.$broadcast('stock:ready', {key: getCacheKey(drugCode, drugName), data: data});
                }
            }).catch(function () {
                if (!resolved) {
                    resolved = true;
                    $timeout.cancel(timer);
                    setCache(drugCode, drugName, unavailable);
                    deferred.resolve(unavailable);
                    $rootScope.$broadcast('stock:ready', {key: getCacheKey(drugCode, drugName), data: unavailable});
                }
            });

            return deferred.promise;
        };

        var prefetch = function (drugs) {
            angular.forEach(drugs, function (drug) {
                var drugCode = getDrugCodeFromReferenceMaps(drug);
                var drugName = getDrugName(drug);
                fetchStock(drugName, drugCode);
            });
        };

        var buildStockHtml = function (stockInfo) {
            if (!stockInfo) {
                return '<span style="color:#999;font-size:0.85em">[Stock unavailable]</span>';
            }
            var qty = stockInfo.quantity;
            var unit = stockInfo.unit || 'units';
            var threshold = stockInfo.low_stock_threshold || 10;

            if (stockInfo.status === 'UNAVAILABLE' || !stockInfo.available) {
                return '<span style="color:#999;font-size:0.85em">[Stock unavailable]</span>';
            }
            if (qty === 0 || stockInfo.status === 'OUT') {
                return '<span style="color:#d9534f;font-size:0.85em">[Out of Stock]</span>';
            }
            if (qty <= threshold || stockInfo.status === 'LOW') {
                return '<span style="color:#e6872e;font-size:0.85em">[Low Stock: ' + qty + ' ' + unit + ']</span>';
            }
            return '<span style="color:#3c763d;font-size:0.85em">[Stock: ' + qty + ' ' + unit + ']</span>';
        };

        var getStockHtmlForDrug = function (drug) {
            var drugCode = getDrugCodeFromReferenceMaps(drug);
            var drugName = getDrugName(drug);
            var cached = getCached(drugCode, drugName);
            return buildStockHtml(cached);
        };

        return {
            fetchStock: fetchStock,
            getCached: getCached,
            getCacheKey: getCacheKey,
            prefetch: prefetch,
            buildStockHtml: buildStockHtml,
            getStockHtmlForDrug: getStockHtmlForDrug,
            getDrugCodeFromReferenceMaps: getDrugCodeFromReferenceMaps,
            getDrugName: getDrugName
        };
    }]);
