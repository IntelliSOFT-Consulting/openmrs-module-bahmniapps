'use strict';

angular.module('bahmni.ipd')
    .controller('BedManagementController', ['$scope', '$rootScope', '$stateParams', '$state', 'spinner', 'wardService', 'bedManagementService', 'visitService', 'messagingService', 'appService', 'ngDialog', 'bedQuotationService',
        function ($scope, $rootScope, $stateParams, $state, spinner, wardService, bedManagementService, visitService, messagingService, appService, ngDialog, bedQuotationService) {
            $scope.wards = null;
            $scope.ward = {};
            $scope.editTagsPrivilege = Bahmni.IPD.Constants.editTagsPrivilege;
            var links = {
                "dashboard": {
                    "name": "inpatient",
                    "translationKey": "PATIENT_ADT_PAGE_KEY",
                    "url": "../bedmanagement/#/patient/{{patientUuid}}/visit/{{visitUuid}}/dashboard"
                }
            };
            var patientForwardUrl = appService.getAppDescriptor().getConfigValue("patientForwardUrl") || links.dashboard.url;

            var isDepartmentPresent = function (department) {
                if (!department) return false;
                return _.values(department).indexOf() === -1;
            };

            var init = function () {
                $rootScope.selectedBedInfo = $rootScope.selectedBedInfo || {};
                loadAllWards().then(function () {
                    var context = $stateParams.context || {};
                    if (context && isDepartmentPresent(context.department)) {
                        expandAdmissionMasterForDepartment(context.department);
                    } else if ($rootScope.bedDetails) {
                        expandAdmissionMasterForDepartment({
                            uuid: $rootScope.bedDetails.wardUuid,
                            name: $rootScope.bedDetails.wardName
                        });
                    }
                    resetDepartments();
                    resetBedInfo();
                });
                refreshReservationLocations();
            };

            var loadAllWards = function () {
                return spinner.forPromise(wardService.getWardsList().success(function (wardsList) {
                    $scope.wards = wardsList.results;
                }));
            };

            // Ward-level / room-level "your patient is reserved/admitted in here" indicators, so a
            // clinician doesn't have to open every ward to find this one patient's bed. Scoped to
            // the currently selected patient only — NOT a global "anyone has a reservation here"
            // view, which would surface other patients' reservations as noise (or a privacy leak)
            // on a screen that's otherwise entirely about the one patient currently selected.
            $scope.reservedWardUuids = {};
            $scope.reservedRoomKeys = {};

            var roomKey = function (wardUuid, roomName) {
                return wardUuid + '|' + roomName;
            };

            $scope.isWardReserved = function (wardUuid) {
                return !!$scope.reservedWardUuids[wardUuid];
            };

            $scope.isRoomReserved = function (wardUuid, roomName) {
                return !!$scope.reservedRoomKeys[roomKey(wardUuid, roomName)];
            };

            var refreshReservationLocations = function () {
                var patientId = $rootScope.patient && $rootScope.patient.identifier;
                if (!patientId) {
                    $scope.reservedWardUuids = {};
                    $scope.reservedRoomKeys = {};
                    return;
                }
                bedQuotationService.getReservationLocations(patientId).then(function (response) {
                    var data = response.data || {};
                    var wardUuids = {};
                    _.each(data.wardUuids, function (uuid) {
                        wardUuids[uuid] = true;
                    });
                    var roomKeys = {};
                    _.each(data.rooms, function (room) {
                        roomKeys[roomKey(room.wardUuid, room.roomName)] = true;
                    });
                    // Also flag the ward/room this patient is *already admitted* to, if any —
                    // covers "or is admitted to that ward", distinct from "has reserved a bed".
                    if ($rootScope.bedDetails && $rootScope.bedDetails.wardUuid) {
                        wardUuids[$rootScope.bedDetails.wardUuid] = true;
                        if ($rootScope.bedDetails.physicalLocationName) {
                            roomKeys[roomKey($rootScope.bedDetails.wardUuid, $rootScope.bedDetails.physicalLocationName)] = true;
                        }
                    }
                    $scope.reservedWardUuids = wardUuids;
                    $scope.reservedRoomKeys = roomKeys;
                });
            };

            $scope.$on("event:bedReservationChanged", refreshReservationLocations);

            var mapRoomInfo = function (roomsInfo) {
                var mappedRooms = [];
                _.forIn(roomsInfo, function (value, key) {
                    var bedsGroupedByBedStatus = _.groupBy(value, 'status');
                    var availableBeds = bedsGroupedByBedStatus["AVAILABLE"] ? bedsGroupedByBedStatus["AVAILABLE"].length : 0;
                    mappedRooms.push({name: key, beds: value, totalBeds: value.length, availableBeds: availableBeds});
                });
                return mappedRooms;
            };

            var getRoomsForWard = function (bedLayouts) {
                bedLayouts.forEach(function (bed) {
                    if (!bed.bedTagMaps) {
                        bed.bedTagMaps = [];
                    }
                    if (!bed.patient) {
                        if (bed.patients && bed.patients.length > 0) {
                            bed.patient = bed.patients[0];
                        }
                    }
                });
                var rooms = mapRoomInfo(_.groupBy(bedLayouts, 'location'));
                _.each(rooms, function (room) {
                    room.beds = bedManagementService.createLayoutGrid(room.beds);
                });
                return rooms;
            };

            var getWardDetails = function (department) {
                return _.filter($scope.wards, function (entry) {
                    return entry.ward.uuid === department.uuid;
                });
            };

            var selectCurrentDepartment = function (department) {
                _.each($scope.wards, function (wardElement) {
                    if (wardElement.ward.uuid === department.uuid) {
                        wardElement.ward.isSelected = true;
                        wardElement.ward.selected = true;
                    }
                });
            };

            // Collects every bedId currently rendered in $scope.ward.rooms (a 2D grid per room —
            // see bedManagementService.createLayoutGrid) so reservation status can be fetched for
            // all of them in one call rather than one request per bed.
            var collectBedIds = function (rooms) {
                var bedIds = [];
                _.each(rooms, function (room) {
                    _.each(room.beds, function (row) {
                        _.each(row, function (cell) {
                            if (cell.bed && cell.bed.bedId) {
                                bedIds.push(cell.bed.bedId);
                            }
                        });
                    });
                });
                return bedIds;
            };

            var refreshReservations = function () {
                if (!$scope.ward || !$scope.ward.rooms) {
                    return;
                }
                var bedIds = collectBedIds($scope.ward.rooms);
                var request = bedQuotationService.getReservationsForBeds(bedIds);
                if (!request) {
                    return;
                }
                request.then(function (response) {
                    var reservationsByBedId = _.keyBy(response.data.reservations, 'bedId');
                    _.each($scope.ward.rooms, function (room) {
                        _.each(room.beds, function (row) {
                            _.each(row, function (cell) {
                                if (cell.bed) {
                                    cell.bed.reservation = cell.bed.bedId ? reservationsByBedId[cell.bed.bedId] : undefined;
                                }
                            });
                        });
                    });
                });
            };

            $scope.$on("event:bedReservationChanged", refreshReservations);

            var loadBedsInfoForWard = function (department) {
                return wardService.bedsForWard(department.uuid).then(function (response) {
                    var wardDetails = getWardDetails(department);
                    var rooms = getRoomsForWard(response.data.bedLayouts);
                    $scope.ward = {
                        rooms: rooms,
                        uuid: department.uuid,
                        name: department.name,
                        totalBeds: wardDetails[0].totalBeds,
                        occupiedBeds: wardDetails[0].occupiedBeds
                    };
                    $scope.departmentSelected = true;
                    $rootScope.selectedBedInfo.wardName = department.name;
                    $rootScope.selectedBedInfo.wardUuid = department.uuid;
                    selectCurrentDepartment(department);
                    $scope.$broadcast("event:departmentChanged");
                    refreshReservations();
                });
            };

            var expandAdmissionMasterForDepartment = function (department) {
                spinner.forPromise(loadBedsInfoForWard(department));
            };

            $scope.onSelectDepartment = function (department) {
                spinner.forPromise(loadBedsInfoForWard(department).then(function () {
                    resetPatientAndBedInfo();
                    resetDepartments();
                    $scope.$broadcast("event:deselectWards");
                    department.isSelected = true;
                }));
            };

            var resetDepartments = function () {
                _.each($scope.wards, function (option) {
                    option.ward.isSelected = false;
                });
            };

            var resetBedInfo = function () {
                $rootScope.selectedBedInfo.roomName = undefined;
                $rootScope.selectedBedInfo.bed = undefined;
            };

            var resetPatientAndBedInfo = function () {
                resetBedInfo();
                goToBedManagement();
            };

            $scope.$on("event:patientAssignedToBed", function (event, bed) {
                $scope.ward.occupiedBeds = $scope.ward.occupiedBeds + 1;
                _.map($scope.ward.rooms, function (room) {
                    if (room.name === $scope.roomName) {
                        room.availableBeds = room.availableBeds - 1;
                    }
                });
            });

            $scope.$on("event:updateSelectedBedInfoForCurrentPatientVisit", function (event, patientUuid) {
                getVisitInfoByPatientUuid(patientUuid).then(function (visitUuid) {
                    var options = { patientUuid: patientUuid, visitUuid: visitUuid };
                    $state.go("bedManagement.patient", options);
                });
            });

            var goToBedManagement = function () {
                if ($state.current.name === "bedManagement.bed") {
                    var options = {};
                    options['context'] = {
                        department: {
                            uuid: $scope.ward.uuid,
                            name: $scope.ward.name
                        },
                        roomName: $scope.roomName
                    };
                    options['dashboardCachebuster'] = Math.random();
                    $state.go("bedManagement", options);
                }
            };

            var getVisitInfoByPatientUuid = function (patientUuid) {
                return visitService.search({
                    patient: patientUuid, includeInactive: false, v: "custom:(uuid,location:(uuid))"
                }).then(function (response) {
                    var results = response.data.results;
                    var activeVisitForCurrentLoginLocation;
                    if (results) {
                        activeVisitForCurrentLoginLocation = _.filter(results, function (result) {
                            return result.location.uuid === $rootScope.visitLocationUuid;
                        });
                    }
                    var hasActiveVisit = activeVisitForCurrentLoginLocation.length > 0;
                    return hasActiveVisit ? activeVisitForCurrentLoginLocation[0].uuid : "";
                });
            };

            $scope.goToAdtPatientDashboard = function () {
                getVisitInfoByPatientUuid($scope.patient.uuid).then(function (visitUuid) {
                    var options = {patientUuid: $scope.patient.uuid, visitUuid: visitUuid};
                    var url = appService.getAppDescriptor().formatUrl(patientForwardUrl, options);
                    window.open(url);
                });
                if (window.scrollY > 0) {
                    window.scrollTo(0, 0);
                }
            };

            $scope.canEditTags = function () {
                return $rootScope.selectedBedInfo.bed && $state.current.name === "bedManagement.bed";
            };

            $scope.editTagsOnTheBed = function () {
                ngDialog.openConfirm({
                    template: 'views/editTags.html',
                    scope: $scope,
                    closeByEscape: true,
                    className: "ngdialog-theme-default ng-dialog-adt-popUp"
                });
            };

            init();
        }]);
