'use strict';

angular.module('bahmni.common.patientSearch')
    .factory('consultationPaymentGateService', ['$http', '$q', function ($http, $q) {
        // Checks whether the given service is PAID for this patient/visit. Always resolves to a
        // boolean — any HTTP failure resolves to false (fail-safe: an unreachable billing check
        // blocks access rather than silently allowing it through).
        var isServicePaid = function (patientUuid, visitUuid, serviceType) {
            if (!patientUuid || !visitUuid || !serviceType) {
                return $q.resolve(false);
            }
            return $http.get('/openmrs/ws/rest/v1/odoo/billing/is-paid', {
                params: {patientUuid: patientUuid, visitUuid: visitUuid, serviceType: serviceType},
                withCredentials: true
            }).then(function (response) {
                return !!(response.data && response.data.paid === true);
            }).catch(function (error) {
                console.warn('[ConsultationPaymentGate] Payment check failed for serviceType=' + serviceType + ' — defaulting to NOT PAID (fail-safe):', error);
                return false;
            });
        };

        var isConsultationPaid = function (patientUuid, visitUuid) {
            return isServicePaid(patientUuid, visitUuid, 'CONSULTATION');
        };

        return {
            isConsultationPaid: isConsultationPaid,
            isServicePaid: isServicePaid
        };
    }]);
