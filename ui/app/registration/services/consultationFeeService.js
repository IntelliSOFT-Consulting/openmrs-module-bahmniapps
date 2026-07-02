'use strict';

angular.module('bahmni.registration')
    .factory('consultationFeeService', ['$http', function ($http) {
        var postFee = function (payload) {
            return $http.post('/openmrs/ws/rest/v1/odooconnector/consultation-fee', payload, {
                withCredentials: true,
                headers: {'Content-Type': 'application/json'}
            });
        };

        return {
            postFee: postFee
        };
    }]);
