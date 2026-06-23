'use strict';

angular.module('bahmni.ipd')
    .controller('RoomGridController', ['$scope', '$rootScope', '$state', '$translate', 'messagingService', 'bedQuotationService',
        function ($scope, $rootScope, $state, $translate, messagingService, bedQuotationService) {
            $scope.getColorForTheTag = function (bed) {
                _.forEach($rootScope.bedTagsColorConfig, function (tagConfig) {
                    if (bed.bedTagMaps.length >= 2) {
                        if ($translate.instant(tagConfig.name) === "MultiTag") {
                            bed.bedTagMaps[0].bedTag.color = tagConfig.color;
                        }
                    } else if (angular.isDefined(bed.bedTagMaps[0]) && $translate.instant(tagConfig.name) === bed.bedTagMaps[0].bedTag.name) {
                        bed.bedTagMaps[0].bedTag.color = tagConfig.color;
                    }
                });
                setDefaultTagColor(bed);
            };
            var setDefaultTagColor = function (bed) {
                if (angular.isDefined(bed.bedTagMaps[0]) && bed.bedTagMaps[0].bedTag.color === undefined) {
                    bed.bedTagMaps[0].bedTag.color = "#D3D3D3";
                }
            };

            // A bed reserved by a DIFFERENT patient's quotation can't be selected until that
            // quotation is cancelled or its own admission completes (bed.status flips to
            // OCCUPIED, which is a separate, pre-existing block already enforced elsewhere). Also
            // drives which badge icon shows on the bed grid: lock for someone else's reservation,
            // clock for the current patient's own.
            $scope.isReservedByAnotherPatient = function (bed) {
                if (!bed.reservation) {
                    return false;
                }
                var currentPatientId = $rootScope.patient && $rootScope.patient.identifier;
                return bed.reservation.patientId !== currentPatientId;
            };

            // Detects "this patient already PAID for a different bed" — $rootScope
            // .patientActiveBedReservation is refreshed by AdtController (the ADT/admission screen
            // sharing this $rootScope) whenever the selected patient or their reservation changes.
            // Returns the existing reservation record on a mismatch, null otherwise (free bed, no
            // reservation yet, not actually paid, or it's the same bed already paid for).
            var getPaidBedMismatch = function (bed) {
                var reservation = $rootScope.patientActiveBedReservation;
                if (!reservation || !bed.bedId) {
                    return null;
                }
                if (reservation.paymentStatus !== 'PAID' && reservation.paymentStatus !== 'WAIVED') {
                    return null;
                }
                if (reservation.bedId === bed.bedId) {
                    return null;
                }
                return reservation;
            };

            var selectBed = function (bed) {
                if ($state.current.name === "bedManagement.bed" || $state.current.name === "bedManagement") {
                    if (bed.status === "AVAILABLE") {
                        $rootScope.patient = undefined;
                    }
                    $rootScope.selectedBedInfo.bed = bed;
                    var options = {bedId: bed.bedId};
                    $state.go("bedManagement.bed", options);
                }
                else if ($state.current.name === "bedManagement.patient") {
                    $rootScope.selectedBedInfo.bed = bed;
                    if (bed.patient) {
                        $scope.$emit("event:updateSelectedBedInfoForCurrentPatientVisit", bed.patient.uuid);
                    }
                }
            };

            $scope.onSelectBed = function (bed) {
                if ($scope.isReservedByAnotherPatient(bed)) {
                    messagingService.showMessage("warning", $translate.instant("BED_ALREADY_RESERVED_MESSAGE"));
                    return;
                }
                // The paid-bed-mismatch workflow only applies on the admission screen, where a
                // specific patient is being booked into a bed — not the general bed board.
                if ($state.current.name === "bedManagement.patient") {
                    var mismatch = getPaidBedMismatch(bed);
                    if (mismatch) {
                        // AdtController (the admit/quotation panel) is a SIBLING directive with its
                        // own isolated scope, not an ancestor of this one — $scope.$emit only
                        // bubbles to ancestors, so it would never reach AdtController's $on
                        // listener. $rootScope.$broadcast reaches every scope in the app instead.
                        $rootScope.$broadcast("event:bedSelectedWithPaidMismatch", {newBed: bed, existingReservation: mismatch});
                        return;
                    }
                }
                selectBed(bed);
            };

            $scope.cancelReservation = function (bed, $event) {
                if ($event) {
                    $event.stopPropagation();
                }
                bedQuotationService.cancelReservation(bed.bedId, 'Cancelled from ward bed grid').then(function () {
                    messagingService.showMessage("info", $translate.instant("BED_RESERVATION_CANCELLED_MESSAGE"));
                    $rootScope.$broadcast("event:bedReservationChanged");
                }, function () {
                    messagingService.showMessage("error", $translate.instant("BED_RESERVATION_CANCEL_FAILED_MESSAGE"));
                });
            };
        }]);
