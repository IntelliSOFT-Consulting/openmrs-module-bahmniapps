'use strict';

angular.module('bahmni.registration')
    .factory('consultationFeeService', ['$http', function ($http) {

        var postFee = function (patientUuid, visitUuid, fee) {
            return $http.post('/openmrs/ws/rest/v1/odooconnector/consultation-fee', {
                patientUuid: patientUuid,
                visitUuid: visitUuid,
                fee: fee
            }, {
                withCredentials: true,
                headers: {'Content-Type': 'application/json'}
            });
        };

        return {
            postFee: postFee
        };
    }]);
