'use strict';

angular.module('bahmni.ipd')
    .factory('bedQuotationService', ['$http', function ($http) {

        var BASE = '/openmrs/ws/rest/v1/odooconnector/bed-order';

        var submitQuotation = function (payload) {
            return $http.post(BASE, payload, {
                withCredentials: true,
                headers: {'Content-Type': 'application/json'}
            });
        };

        var getReservationsForBeds = function (bedIds) {
            if (!bedIds || !bedIds.length) {
                return null;
            }
            return $http.get(BASE + '/reservations', {
                params: {bedIds: bedIds.join(',')},
                withCredentials: true
            });
        };

        // Lightweight ward/room-level overview — which wards/rooms have an active reservation for
        // THIS patient (not anyone else's), so the ward list and room tabs can show "your
        // patient's reservation is in here" without opening every ward to look for it.
        var getReservationLocations = function (patientId) {
            return $http.get(BASE + '/reservations/locations', {
                params: {patientId: patientId},
                withCredentials: true
            });
        };

        var cancelReservation = function (bedId, reason) {
            return $http.post(BASE + '/cancel', {bedId: bedId, reason: reason}, {
                withCredentials: true,
                headers: {'Content-Type': 'application/json'}
            });
        };

        // The single bed (if any) this patient currently holds an active reservation for, across
        // all wards — used to detect a clinician selecting a different bed for a patient who
        // already paid for a specific one.
        var getActivePatientReservation = function (patientId) {
            return $http.get(BASE + '/reservations/patient-active', {
                params: {patientId: patientId},
                withCredentials: true
            });
        };

        return {
            submitQuotation: submitQuotation,
            getReservationsForBeds: getReservationsForBeds,
            getReservationLocations: getReservationLocations,
            cancelReservation: cancelReservation,
            getActivePatientReservation: getActivePatientReservation
        };
    }]);
