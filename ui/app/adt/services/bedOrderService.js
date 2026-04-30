'use strict';

angular.module('bahmni.adt')
    .factory('bedOrderService', ['$http', function ($http) {

        var BASE = '/openmrs/ws/rest/v1/odooconnector/bed-order';

        var postBedOrder = function (orderData) {
            return $http.post(BASE, orderData, {
                withCredentials: true,
                headers: {'Content-Type': 'application/json'}
            });
        };

        var getPaymentStatus = function (patientUuid, bedId) {
            return $http.get(BASE + '/payment-status', {
                params: {patientUuid: patientUuid, bedId: bedId},
                withCredentials: true
            });
        };

        return {
            postBedOrder: postBedOrder,
            getPaymentStatus: getPaymentStatus
        };
    }]);
