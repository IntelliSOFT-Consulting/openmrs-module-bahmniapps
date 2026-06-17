'use strict';

angular.module('bahmni.common.patientSearch')
    .factory('consultationPaymentGateService', ['$http', '$q', function ($http, $q) {

        // Checks whether the patient's consultation fee is PAID for the given visit.
        // Always resolves to a boolean — any HTTP failure resolves to false (fail-safe: an
        // unreachable billing check blocks access rather than silently allowing it through).
        var isConsultationPaid = function (patientUuid, visitUuid) {
            if (!patientUuid || !visitUuid) {
                return $q.resolve(false);
            }
            return $http.get('/openmrs/ws/rest/v1/odoo/billing/is-paid', {
                params: {patientUuid: patientUuid, visitUuid: visitUuid, serviceType: 'CONSULTATION'},
                withCredentials: true
            }).then(function (response) {
                return !!(response.data && response.data.paid === true);
            }).catch(function (error) {
                console.warn('[ConsultationPaymentGate] Payment check failed — defaulting to NOT PAID (fail-safe):', error);
                return false;
            });
        };

        return {
            isConsultationPaid: isConsultationPaid
        };
    }]);
