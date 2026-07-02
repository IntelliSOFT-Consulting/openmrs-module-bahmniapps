'use strict';

angular.module('bahmni.clinical')
    .factory('stockService', ['$http', '$q', '$timeout', '$rootScope', function ($http, $q, $timeout, $rootScope) {
        var CACHE_TTL_MS = 120000; // 2 minutes
        var FETCH_TIMEOUT_MS = 3000; // 3 seconds
        var cache = {};

        var getCached = function (drugUuid) {
            var entry = cache[drugUuid];
            if (entry && Date.now() < entry.expires) {
                return entry.data;
            }
            return null;
        };

        var setCache = function (drugUuid, data) {
            cache[drugUuid] = {data: data, expires: Date.now() + CACHE_TTL_MS};
        };

        var fetchStock = function (drugUuid) {
            if (!drugUuid) {
                return $q.resolve({available: false, quantityAvailable: 0, error: 'Drug mapping not found'});
            }
            var cached = getCached(drugUuid);
            if (cached) {
                return $q.resolve(cached);
            }

            var deferred = $q.defer();
            var resolved = false;

            var unavailable = {available: false, quantityAvailable: 0, error: 'Drug mapping not found'};

            var timer = $timeout(function () {
                if (!resolved) {
                    resolved = true;
                    setCache(drugUuid, unavailable);
                    deferred.resolve(unavailable);
                    $rootScope.$broadcast('stock:ready', {key: drugUuid, data: unavailable});
                }
            }, FETCH_TIMEOUT_MS);

            $http.get('/openmrs/ws/rest/v1/odooconnector/stock', {
                params: {
                    drugUuid: drugUuid
                },
                withCredentials: true
            }).then(function (response) {
                if (!resolved) {
                    resolved = true;
                    $timeout.cancel(timer);
                    var data = response.data;
                    setCache(drugUuid, data);
                    deferred.resolve(data);
                    $rootScope.$broadcast('stock:ready', {key: drugUuid, data: data});
                }
            }).catch(function () {
                if (!resolved) {
                    resolved = true;
                    $timeout.cancel(timer);
                    setCache(drugUuid, unavailable);
                    deferred.resolve(unavailable);
                    $rootScope.$broadcast('stock:ready', {key: drugUuid, data: unavailable});
                }
            });

            return deferred.promise;
        };

        var prefetch = function (drugs) {
            angular.forEach(drugs, function (drug) {
                fetchStock(drug.uuid);
            });
        };

        var formatQuantity = function (qty) {
            return (qty % 1 === 0) ? qty.toFixed(0) : String(qty);
        };

        var buildStockHtml = function (stockInfo) {
            if (!stockInfo || stockInfo.error) {
                return '<span style="color:#999;font-size:0.85em">[Stock unavailable]</span>';
            }
            if (!stockInfo.available) {
                return '<span style="color:#d9534f;font-size:0.85em">- Out of Stock</span>';
            }
            return '<span style="color:#3c763d;font-size:0.85em">- '
                + formatQuantity(stockInfo.quantityAvailable) + ' ' + (stockInfo.unit || 'Units') + ' Available</span>';
        };

        var getStockHtmlForDrug = function (drug) {
            var cached = getCached(drug.uuid);
            return buildStockHtml(cached);
        };

        // A more prominent label (distinct styling from the inline autocomplete hint above) shown
        // on the add-treatment form itself once a drug is selected, so the clinician sees the
        // exact stock position before entering a quantity. Uses CSS classes (styled in
        // _treatment.scss/clinical.css) rather than inline styles, since this is rendered via
        // ng-bind-html and ngSanitize strips the style attribute.
        var buildStockLabelHtml = function (stockInfo) {
            if (!stockInfo || stockInfo.error) {
                return '<div class="drug-stock-label drug-stock-label-unknown">Stock information unavailable</div>';
            }
            if (!stockInfo.available) {
                return '<div class="drug-stock-label drug-stock-label-out">Out of Stock</div>';
            }
            return '<div class="drug-stock-label drug-stock-label-available">In Stock: '
                + formatQuantity(stockInfo.quantityAvailable) + ' ' + (stockInfo.unit || 'Units') + ' Available</div>';
        };

        var getStockLabelForDrug = function (drug) {
            if (!drug || !drug.uuid) {
                return '';
            }
            return buildStockLabelHtml(getCached(drug.uuid));
        };

        // For rows already added to the New Prescription table: returns a flag only when there's
        // a real problem to act on (out of stock, or the prescribed quantity exceeds what's
        // available) — empty string otherwise, so normal rows stay uncluttered and only the
        // ones a doctor might want to remove/adjust are called out.
        var getStockWarningForTreatment = function (treatment) {
            if (!treatment || !treatment.drug || !treatment.drug.uuid) {
                return '';
            }
            var stockInfo = getCached(treatment.drug.uuid);
            if (!stockInfo || stockInfo.error) {
                return '';
            }
            if (!stockInfo.available) {
                return '<span class="drug-stock-warning drug-stock-warning-out">Out of Stock</span>';
            }
            if (treatment.quantity && treatment.quantity > stockInfo.quantityAvailable) {
                return '<span class="drug-stock-warning drug-stock-warning-exceeds">Exceeds Stock ('
                    + formatQuantity(stockInfo.quantityAvailable) + ' ' + (stockInfo.unit || 'Units') + ' available)</span>';
            }
            return '';
        };

        return {
            fetchStock: fetchStock,
            getCached: getCached,
            prefetch: prefetch,
            buildStockHtml: buildStockHtml,
            getStockHtmlForDrug: getStockHtmlForDrug,
            getStockLabelForDrug: getStockLabelForDrug,
            getStockWarningForTreatment: getStockWarningForTreatment
        };
    }]);
