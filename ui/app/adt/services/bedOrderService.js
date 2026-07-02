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

        // Payment status for BED is the same generic gate-check endpoint consultation fees use —
        // there is no bed-specific payment-status endpoint (the old one called a nonexistent Odoo
        // API and was removed).
        var getPaymentStatus = function (patientUuid, visitUuid) {
            return $http.get('/openmrs/ws/rest/v1/odoo/billing/is-paid', {
                params: {patientUuid: patientUuid, visitUuid: visitUuid, serviceType: 'BED'},
                withCredentials: true
            });
        };

        return {
            postBedOrder: postBedOrder,
            getPaymentStatus: getPaymentStatus
        };
    }]);
